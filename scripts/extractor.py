import os
import shutil
import argparse
import time

# Common text-based extensions that can just be converted to .txt
TEXT_EXTENSIONS = {'.csv', '.json', '.xml', '.log', '.yml', '.yaml', '.ini', '.cfg', '.py', '.js', '.css', '.java', '.c', '.cpp', '.h'}

def convert_and_extract(src_dir, dest_dir):
    """
    Walks through src_dir, extracts .md, .pdf, and .txt files directly to dest_dir.
    Attempts to convert other file types to .txt or .md where possible.
    """
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        print(f"Created new folder: {dest_dir}")
        
    for root, _, files in os.walk(src_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            src_path = os.path.join(root, file)
            
            # Avoid extracting into the destination folder if it is a subfolder of source
            if os.path.abspath(src_path).startswith(os.path.abspath(dest_dir)):
                continue
            
            # Preserve directory structure in destination
            rel_path = os.path.relpath(root, src_dir)
            dest_subdir = os.path.join(dest_dir, rel_path)
            if not os.path.exists(dest_subdir):
                os.makedirs(dest_subdir)
                
            dest_path = os.path.join(dest_subdir, file)
            
            # 1. Directly extract target filetypes
            if ext in {'.md', '.pdf', '.txt'}:
                print(f"Copying {src_path} -> {dest_path}")
                shutil.copy2(src_path, dest_path)
                
            # 2. Convert general text/code files to .txt
            elif ext in TEXT_EXTENSIONS:
                new_dest_path = os.path.splitext(dest_path)[0] + '.txt'
                print(f"Converting text-based file {src_path} -> {new_dest_path}")
                try:
                    with open(src_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    with open(new_dest_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                except Exception as e:
                    print(f"Failed to read/write {src_path}: {e}")
                    
            # 3. Convert DOCX to .txt (requires docx2txt)
            elif ext == '.docx':
                new_dest_path = os.path.splitext(dest_path)[0] + '.txt'
                try:
                    import docx2txt
                    text = docx2txt.process(src_path)
                    with open(new_dest_path, 'w', encoding='utf-8') as f:
                        f.write(text)
                    print(f"Converted DOCX {src_path} -> {new_dest_path}")
                except ImportError:
                    print(f"Skipping {src_path}: 'docx2txt' not installed. To support, run: pip install docx2txt")
                except Exception as e:
                    print(f"Failed to convert {src_path}: {e}")
                    
            # 4. Convert HTML to .md (requires markdownify)
            elif ext in {'.html', '.htm'}:
                new_dest_path = os.path.splitext(dest_path)[0] + '.md'
                try:
                    import markdownify
                    with open(src_path, 'r', encoding='utf-8', errors='ignore') as f:
                        html = f.read()
                    md = markdownify.markdownify(html, heading_style="ATX")
                    with open(new_dest_path, 'w', encoding='utf-8') as f:
                        f.write(md)
                    print(f"Converted HTML {src_path} -> {new_dest_path}")
                except ImportError:
                    print(f"Skipping {src_path}: 'markdownify' not installed. To support, run: pip install markdownify")
                except Exception as e:
                    print(f"Failed to convert {src_path}: {e}")
            else:
                pass # Skip silently or add verbose flag

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract and convert files to MD, PDF, or TXT.')
    parser.add_argument('src_dir', nargs='?', default='.', help='Source directory to scan (default: current directory)')
    parser.add_argument('dest_dir', nargs='?', help='Destination directory for extracted/converted files (default: vector-prep-extract_<timestamp>)')
    args = parser.parse_args()
    
    if args.dest_dir is None:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        args.dest_dir = f"vector-prep-extract_{timestamp}"
    
    convert_and_extract(args.src_dir, args.dest_dir)
