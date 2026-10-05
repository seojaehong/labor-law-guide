from pathlib import Path
import json
import fitz

folder = Path('docs/design-visuals/severance-statement-20261005')
report = []
for version in ['before', 'after']:
    document = fitz.open(folder / f'{version}-a4.pdf')
    page = document[0]
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(folder / f'{version}-a4.png')
    text = ''.join(p.get_text() for p in document)
    row = dict(version=version, pages=len(document), width=page.rect.width, height=page.rect.height,
               syntheticWorkerPresent='합성 근로자' in text,
               netAmountPresent='실수령' in text,
               signaturePresent='사업주' in text)
    report.append(row)
    if version == 'after':
        assert len(document) == 1, row
        assert abs(page.rect.width - 595.28) < 1 and abs(page.rect.height - 841.89) < 1, row
        assert all(row[k] for k in ['syntheticWorkerPresent', 'netAmountPresent', 'signaturePresent']), row
(folder / 'a4-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
