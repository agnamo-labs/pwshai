#!/usr/bin/env python3
"""Writable multi-root WebDAV server for tailnet sharing.

Bind this to 127.0.0.1 and publish it with `tailscale serve --bg <port>`.
`serve <port>` is the primitive that works unelevated on Windows, unlike
`serve <path>`, which demands a local-admin token. Read/write comes from WebDAV,
not from `serve` — `serve <path>` is a read-only HTTP listing and cannot accept
writes at all.

Usage:
    python tailshare.py --root Z:/ --root docs=C:/Users/me/Documents --port 8420
    python tailshare.py --read-only --port 8420
    python tailshare.py --list-drives

Roots are `LABEL=PATH` (LABEL optional; defaults to the path's basename). Each
root is mounted at /LABEL/ so several drives can be published at once without
colliding.
"""
import argparse
import os
import shutil
import string
import sys
import traceback

from wsgidav.wsgidav_app import WsgiDAVApp
from wsgidav.fs_dav_provider import FilesystemProvider, FolderResource
from wsgidav.dir_browser import WsgiDavDirBrowser
from wsgidav.error_printer import ErrorPrinter
from wsgidav.mw.cors import Cors
from wsgidav.request_resolver import RequestResolver
from cheroot import wsgi

# ---------------------------------------------------------------------------
# Unreadable entries must not 403 the whole listing.
#
# On Windows a drive root contains "System Volume Information" and
# "$RECYCLE.BIN", whose ACLs deny the interactive user. wsgidav reports per
# collection size by calling shutil.disk_usage() on each member, that raises
# PermissionError (EACCES), and error_printer converts it into a flat 403 for
# the PARENT PROPFIND while every child PROPFINDs fine. Symptom: the share looks
# empty and cannot be mounted at all.
#
# Two chokepoints both need neutralising, and missing either one still 403s:
#   get_used_bytes / get_available_bytes  -> the quota properties
#   get_member_names                      -> what the directory listing walks
# Returning None for the byte counts is what wsgidav expects (callers check
# `is not None`); filtering the name list also keeps OS noise out of the share.
# ---------------------------------------------------------------------------
_real_disk_usage = shutil.disk_usage


def _safe_disk_usage(path):
    try:
        return _real_disk_usage(path)
    except OSError:
        return None


def _safe_used_bytes(self):
    u = _safe_disk_usage(self._file_path)
    return u.used if u else None


def _safe_available_bytes(self):
    u = _safe_disk_usage(self._file_path)
    return u.free if u else None


_orig_member_names = FolderResource.get_member_names

# Windows marks OS-metadata directories as BOTH hidden and system. Requiring
# both bits drops "System Volume Information" and "$RECYCLE.BIN" while leaving
# ordinary hidden files alone. Cheap: no extra I/O beyond the stat we already do.
_HIDDEN_AND_SYSTEM = 0x2 | 0x4


def _readable_member_names(self):
    names = []
    for name in _orig_member_names(self):
        full = os.path.join(self._file_path, name)
        try:
            st = os.stat(full)
        except OSError:
            continue  # unreadable by this account: omit rather than 403
        attrs = getattr(st, "st_file_attributes", 0)
        if attrs & _HIDDEN_AND_SYSTEM == _HIDDEN_AND_SYSTEM:
            continue  # OS metadata dir we could never serve anyway
        names.append(name)
    return names


FolderResource.get_used_bytes = _safe_used_bytes
FolderResource.get_available_bytes = _safe_available_bytes
FolderResource.get_member_names = _readable_member_names


class TolerantProvider(FilesystemProvider):
    """Return None for entries we cannot stat, so the stdlib 404s them."""

    def get_resource_inst(self, path, environ):
        try:
            return super().get_resource_inst(path, environ)
        except OSError:
            return None


def default_roots():
    """Every mounted fixed drive, so nothing needs hardcoding per machine."""
    roots = []
    if os.name == "nt":
        for letter in string.ascii_uppercase:
            p = f"{letter}:\\"
            if os.path.exists(p):
                roots.append((letter.lower(), p))
    else:
        roots.append(("root", "/"))
    return roots


def parse_root(spec):
    if "=" in spec and not (len(spec) > 1 and spec[1] == ":"):
        label, path = spec.split("=", 1)
    else:
        label, path = "", spec
    path = os.path.abspath(os.path.expanduser(path.strip().strip('"')))
    if not label:
        base = os.path.basename(path.rstrip("/\\")) or path.rstrip("/\\").replace(":", "")
        label = base.lower() or "root"
    label = label.strip("/\\").strip()
    return label, path


def build_config(roots, read_only, verbose):
    provider_mapping = {}
    for label, path in roots:
        provider_mapping[f"/{label}"] = TolerantProvider(path, readonly=read_only)

    # A client that maps the bare hostname issues PROPFIND on "/". With only
    # /<label>/ prefixes registered that 404s and the mount fails outright, so
    # alias the first root at "/" as well. Each root stays addressable at
    # /<label>/ regardless.
    if roots:
        first_label, first_path = roots[0]
        provider_mapping["/"] = TolerantProvider(first_path, readonly=read_only)

    return {
        "provider_mapping": provider_mapping,
        "host": "127.0.0.1",
        # No HTTPAuthenticator: tailnet membership is the access control, and
        # DEFAULT_CONFIG injects an authenticator that would 401 everything.
        "middleware_stack": [Cors, ErrorPrinter, WsgiDavDirBrowser, RequestResolver],
        "http_authenticator": {"domain_controller": None},
        "simple_dc": {"user_mapping": {"*": True}},
        "verbose": verbose,
        "dir_browser": {
            "enable": True,
            "response_trailer": (
                "<hr/><p><b>tailshare</b> — served to this tailnet via "
                "<code>tailscale serve</code>. Membership is the credential; "
                "there is no second login.</p>"
            ),
        },
        "hotfixes": {"emulate_win32_lastmod": False, "re_encode_path_info": False},
        "property_manager": True,
        "lock_storage": True,
    }


def main():
    ap = argparse.ArgumentParser(description="Writable tailnet WebDAV share")
    ap.add_argument("--root", action="append", default=[], metavar="[LABEL=]PATH",
                    help="directory to publish; repeatable")
    ap.add_argument("--port", type=int, default=8420)
    ap.add_argument("--read-only", action="store_true", help="serve without write verbs")
    ap.add_argument("--verbose", type=int, default=1)
    ap.add_argument("--list-drives", action="store_true")
    args = ap.parse_args()

    if args.list_drives:
        for label, path in default_roots():
            print(f"{label}\t{path}")
        return 0

    specs = args.root or [f"{lbl}={p}" for lbl, p in default_roots()]
    roots = []
    for spec in specs:
        label, path = parse_root(spec)
        if not os.path.isdir(path):
            print(f"skipping {path}: not a directory", file=sys.stderr)
            continue
        roots.append((label, path))

    if not roots:
        print("no usable roots", file=sys.stderr)
        return 2

    config = build_config(roots, args.read_only, args.verbose)
    app = WsgiDAVApp(config)

    mode = "READ-ONLY" if args.read_only else "READ/WRITE"
    if sys.stdout is not None:
        print(f"tailshare {mode} on http://127.0.0.1:{args.port}/", flush=True)
        for label, path in roots:
            print(f"  /{label}/  ->  {path}", flush=True)
        print("publish with: tailscale serve --bg %d" % args.port, flush=True)

    server = wsgi.Server(("127.0.0.1", args.port), app, numthreads=10)
    try:
        server.start()
    except KeyboardInterrupt:
        pass
    except OSError as e:
        print(f"bind failed on {args.port}: {e}", file=sys.stderr)
        return 1
    finally:
        try:
            server.stop()
        except Exception:
            traceback.print_exc()
    return 0


if __name__ == "__main__":
    sys.exit(main())
