import pandas as pd

xl = pd.ExcelFile(r'd:\BudgetApp\Income Statement Template.xlsx')
print('Sheet names:', xl.sheet_names)
print()

for sheet in xl.sheet_names:
    print(f'=== {sheet} ===')
    df = pd.read_excel(xl, sheet_name=sheet, header=None)
    print(df.to_string())
    print()
