"""공식 서식 PDF 에서 1쪽만 떼어 저장한다(제출하는 쪽만 싣는다). 사용: first_page.py <src.pdf> <out.pdf>"""
import sys

import fitz

src, out = sys.argv[1], sys.argv[2]
d = fitz.open(src)
o = fitz.open()
o.insert_pdf(d, from_page=0, to_page=0)
o.save(out, garbage=4, deflate=True)
print(out, o.page_count)
