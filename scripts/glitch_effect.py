import sys
import os
import random
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

KNOWN_EFFECTS = [
    "glitch", "matrix", "waves", "rain", "beams", "scatter", 
    "spotlights", "spray", "decrypt", "bubbles", "burn", 
    "fireworks", "crumble", "overflow", "blackhole"
]

def render_fallback_animation(text, effect_name="glitch"):
    lines = text.splitlines() if text else ["PWSHAI SUPERCHARGED TERMINAL"]
    clean_effect = effect_name.lower()

    if clean_effect in ["matrix", "decrypt"]:
        colors = ["\033[38;5;46m", "\033[38;5;82m", "\033[38;5;118m", "\033[38;5;154m", "\033[38;5;190m"]
        chars = ["0", "1", "X", "Z", "#", "%", "*", "$", "@"]
        for frame in range(8):
            out = []
            for line in lines:
                row = ""
                for c in line:
                    if c != " " and random.random() < 0.3:
                        row += random.choice(colors) + random.choice(chars) + "\033[0m"
                    else:
                        row += "\033[38;5;46m" + c + "\033[0m"
                out.append(row)
            print("\033[H\033[J" + "\n".join(out))
            time.sleep(0.04)
        print("\033[38;5;46m" + text + "\033[0m")

    elif clean_effect in ["waves", "blow", "breeze", "wave", "wind"]:
        colors = ["\033[38;5;51m", "\033[38;5;45m", "\033[38;5;39m", "\033[38;5;33m", "\033[38;5;27m"]
        for frame in range(10):
            out = []
            for line in lines:
                row = ""
                for i, c in enumerate(line):
                    col = colors[(i + frame) % len(colors)]
                    row += col + c + "\033[0m"
                out.append(row)
            print("\033[H\033[J" + "\n".join(out))
            time.sleep(0.04)
        print("\033[38;5;51m" + text + "\033[0m")

    elif clean_effect in ["swirl", "cyclone", "vortex"]:
        colors = ["\033[38;5;201m", "\033[38;5;165m", "\033[38;5;129m", "\033[38;5;93m", "\033[38;5;57m"]
        for frame in range(10):
            indent = " " * ((frame % 5) * 2)
            out = [indent + colors[frame % len(colors)] + line + "\033[0m" for line in lines]
            print("\033[H\033[J" + "\n".join(out))
            time.sleep(0.04)
        print("\033[38;5;201m" + text + "\033[0m")

    else:
        # Default Glitch
        colors = ["\033[38;5;198m", "\033[38;5;51m", "\033[38;5;154m", "\033[38;5;226m", "\033[38;5;201m"]
        glitch_chars = ["#", "@", "%", "*", "&", "+", "=", "/", "\\", "X"]
        for frame in range(10):
            out = []
            for line in lines:
                g_line = ""
                for char in line:
                    if char != " " and random.random() < 0.25:
                        g_line += random.choice(colors) + random.choice(glitch_chars) + "\033[0m"
                    else:
                        g_line += random.choice(colors) + char + "\033[0m"
                out.append(g_line)
            print("\033[H\033[J" + "\n".join(out))
            time.sleep(0.04)
        print("\033[38;5;198m" + text + "\033[0m")

def render_effect(text, effect_name="glitch"):
    rendered = False
    try:
        import importlib
        mod_name = f"terminaltexteffects.effects.effect_{effect_name.lower()}"
        mod = importlib.import_module(mod_name)
        effect_cls = None
        for attr in dir(mod):
            if attr.lower() == effect_name.lower() or attr.lower() == f"{effect_name.lower()}effect":
                effect_cls = getattr(mod, attr)
                break
        if not effect_cls:
            for attr in dir(mod):
                if isinstance(getattr(mod, attr), type) and attr.endswith("Effect"):
                    effect_cls = getattr(mod, attr)
                    break
        if effect_cls:
            effect = effect_cls(text)
            with effect.terminal_output() as terminal:
                for frame in effect:
                    terminal.print(frame)
            rendered = True
    except Exception:
        pass

    if not rendered:
        render_fallback_animation(text, effect_name)

if __name__ == "__main__":
    effect = sys.argv[1] if len(sys.argv) > 1 else "glitch"
    text = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "⚡ PWSHAI SUPERCHARGED AI & SLASH SUITE ⚡"
    render_effect(text, effect)
