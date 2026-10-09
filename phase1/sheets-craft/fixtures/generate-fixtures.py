"""Independent XLSX producer, not GridCraft's own serializer. Requires openpyxl 3.1.5."""
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.chart import BarChart, Reference
root = Path(__file__).resolve().parents[0]
w = Workbook(); s = w.active; s.title = 'Sales'
s.append(['Product', 'Quantity', 'Total'])
s.append(['Coffee', 2, '=B2*10']); s.append(['Tea', 3, '=B3*5'])
s['A1'].font = Font(bold=True); s.freeze_panes = 'A2'
s.merge_cells('A5:C5'); s['A5']='Independent openpyxl fixture'
chart = BarChart(); chart.add_data(Reference(s, min_col=2, min_row=1, max_row=3), titles_from_data=True); s.add_chart(chart,'E2')
t = w.create_sheet('Summary'); t['A1']='=SUM(Sales!C2:C3)'; t['B1']='Grüße ☕'
w.save(root/'fixture.xlsx')
large=Workbook(); s=large.active; s.title='Numeric 100k'
for r in range(1,10001): s.append([r*c for c in range(1,11)])
large.save(root/'100k.xlsx')
