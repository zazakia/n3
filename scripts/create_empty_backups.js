const fs = require('fs');
const path = require('path');

const backupDir = 'd:/GitHub/ReactNative-expo-LoanWaterMelon/backups/remote_2026-04-01_19-47-21';
const tables = [
  'app_expenses', 'app_cash_transactions', 'app_bank_accounts', 
  'app_bank_transactions', 'app_collection_logs', 'app_financial_snapshots', 
  'app_remittances', 'app_savings_transactions', 'app_expense_categories', 
  'app_loan_penalties', 'collection_groups', 'app_action_logs'
];

tables.forEach(table => {
  const filePath = path.join(backupDir, `${table}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]');
    console.log(`Created empty ${table}.json`);
  }
});
