"""OCR all screenshots using RapidOCR and output text for verification."""
import os, json
from rapidocr_onnxruntime import RapidOCR

SCREENSHOTS_DIR = '/home/cwlai/itcrms/web/screenshots'
OUTPUT_FILE = '/home/cwlai/itcrms/web/ocr-results.json'

ocr = RapidOCR()

results = {}
for filename in sorted(os.listdir(SCREENSHOTS_DIR)):
    if not filename.endswith('.png'):
        continue
    path = os.path.join(SCREENSHOTS_DIR, filename)
    result, elapsed = ocr(path)
    if result:
        # Extract text lines with confidence
        lines = []
        for item in result:
            text = item[1]
            confidence = item[2]
            lines.append(f"[{confidence:.0%}] {text}")
        full_text = '\n'.join(lines)
    else:
        full_text = '(no text detected)'

    results[filename] = {
        'text': full_text,
        'char_count': len(full_text),
        'line_count': len(result) if result else 0,
    }
    print(f"  {'✅' if result else '⚠️'} {filename}: {len(result) if result else 0} lines, {len(full_text)} chars")

with open(OUTPUT_FILE, 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n✅ OCR results → {OUTPUT_FILE}")
print(f"   {sum(1 for v in results.values() if v['line_count'] > 0)}/{len(results)} images had text")