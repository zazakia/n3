const fs = require('fs');
const loans = JSON.parse(fs.readFileSync('scripts/migration-data/loans.json'));
const mismatches = loans.filter(l => l.net_loan !== l.loan_amount);
const nonReloanMismatches = mismatches.filter(l => !l.is_reloan);
console.log(`Total loans: ${loans.length}`);
console.log(`Loans with net_loan != loan_amount: ${mismatches.length}`);
console.log(`Non-reloans with net_loan != loan_amount: ${nonReloanMismatches.length}`);
if (nonReloanMismatches.length > 0) {
  console.log(`Sample non-reloan: loan_amount=${nonReloanMismatches[0].loan_amount}, net_loan=${nonReloanMismatches[0].net_loan}`);
}
