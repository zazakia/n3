# InfinityFinance User Manual - Loan Business Logic

This document strictly defines the business logic and computations for Daily and Weekly loans within the InfinityFinance application. These rules must be implemented and followed strictly.

Kini nga dokumento estriktong nagpasabot sa pamaagi sa negosyo (business logic) ug mga kompyutasyon para sa Daily (Adlaw-adlaw) ug Weekly (Semana) nga mga pautang sulod sa InfinityFinance application. Kinahanglan kining sundon og maayo.

---

## 1. Daily Loans (Adlaw-adlaw nga Pautang)

### English Explanation
Daily loans are structured with **Upfront Deductions**. When a borrower takes a loan, the interest and insurance are deducted before the money is released.

*   **Principal Amount:** The face value of the loan (e.g., ₱5,000).
*   **Upfront Deductions:** The sum of Interest and Insurance. 
    *   *Example:* ₱1,000 (Interest) + ₱200 (Insurance) = ₱1,200 total deduction.
*   **Net Loan Released:** The actual cash given to the borrower.
    *   *Formula:* `Principal - Upfront Deductions`
    *   *Example:* ₱5,000 - ₱1,200 = ₱3,800 Net Released.
*   **Total Amount to Repay:** Since the interest was already deducted upfront, the borrower only repays the Principal amount.
    *   *Example:* The borrower repays exactly ₱5,000 over the term.
*   **Daily Installment:** The daily payment amount (e.g., ₱100 / day).

### Cebuano (Bisaya) Explanation
Ang Daily loans kay adunay **Upfront Deductions** (Kaltas daan). Inig utang sa usa ka kliyente, ang interes ug ang insurance awtomatik nga ginakaltas sa dili pa ihatag ang kwarta.

*   **Principal Amount:** Ang tibuok kantidad sa giutang (pananglitan, ₱5,000).
*   **Upfront Deductions (Mga Kaltas):** Kini ang total sa Interes ug Insurance.
    *   *Pananglitan:* ₱1,000 (Interes) + ₱200 (Insurance) = ₱1,200 tibuok kaltas.
*   **Net Loan Released (Kwarta nga Nadawat):** Ang mismong cash nga makuha sa nangutang.
    *   *Pormula:* `Principal - Mga Kaltas`
    *   *Pananglitan:* ₱5,000 - ₱1,200 = ₱3,800 ang nadawat.
*   **Total Amount to Repay (Tibuok Bayranan):** Tungod kay gikuha na daan ang interes, ang principal amount na lang ang bayran sa nangutang.
    *   *Pananglitan:* ₱5,000 gayud ang ibalik og bayad sulod sa gitakda nga adlaw.
*   **Daily Installment:** Ang kantidad nga bayran adlaw-adlaw (pananglitan, ₱100 matag adlaw).

---

## 2. Weekly Loans (Semana nga Pautang)

### English Explanation
Weekly loans generally have **No Upfront Deductions**. The borrower receives the full principal, and the interest is added to form the total obligation. Payments include savings and insurance.

*   **Principal Amount:** The face value of the loan (e.g., ₱5,000).
*   **Net Loan Released:** Usually equals the Principal (₱5,000). No deductions are made.
*   **Total Obligation:** The Principal + Interest (e.g., ₱5,000 + ₱1,000 = ₱6,000).
*   **Weekly Breakdown:** The weekly payment is divided into three components:
    1.  **Principal Installment:** Pays down the loan (e.g., ₱250).
    2.  **CBU / Savings:** Mandatory savings deposit (e.g., ₱50).
    3.  **Insurance:** Weekly insurance premium (e.g., ₱17).
*   **Total Weekly Payment (Cash Collected):** The exact amount collected by the collector.
    *   *Formula:* `Principal Installment + Savings + Insurance`
    *   *Example:* ₱250 + ₱50 + ₱17 = ₱317.
*   **App Implementation:** The system must strictly record the **Total Weekly Payment** (₱317) as the amount paid in the main ledger, while simultaneously recording the Savings portion (₱50) into the borrower's savings account.

### Cebuano (Bisaya) Explanation
Ang Weekly loans kasagaran **Walay Kaltas Daan** (No Upfront Deductions). Makuha sa nangutang ang tibuok principal, ug ang interes idugang aron makuha ang tibuok utang. Ang bayad matag semana adunay apil nga savings ug insurance.

*   **Principal Amount:** Ang tibuok kantidad sa giutang (pananglitan, ₱5,000).
*   **Net Loan Released (Kwarta nga Nadawat):** Kasagaran parehas sa Principal (₱5,000). Walay kaltas nga mahitabo.
*   **Total Obligation (Tibuok Bayranan):** Ang Principal + Interes (pananglitan, ₱5,000 + ₱1,000 = ₱6,000).
*   **Weekly Breakdown (Bahin-bahin sa Bayad matag Semana):** Ang bayad gibahin sa tulo ka parte:
    1.  **Principal Installment:** Ang mobayad sa mismong utang (pananglitan, ₱250).
    2.  **CBU / Savings:** Pinugos nga tigom o savings (pananglitan, ₱50).
    3.  **Insurance:** Bayad para sa insurance matag semana (pananglitan, ₱17).
*   **Total Weekly Payment (Tibuok Bayad Kolektahon):** Ang mismong kwarta nga dawaton sa collector.
    *   *Pormula:* `Principal Installment + Savings + Insurance`
    *   *Pananglitan:* ₱250 + ₱50 + ₱17 = ₱317.
*   **App Implementation (Pamaagi sa App):** Kinahanglan estrikto nga i-record sa sistema ang **Total Weekly Payment** (₱317) isip bayad sa utang. Sa samang higayon, i-record usab ang bahin para sa Savings (₱50) sulod sa savings account sa kliyente.

---

## 3. Rollovers (Renewals / Reloan)

### English Explanation
When a borrower applies for a new loan before fully paying off their previous active loan, the system processes a **Rollover**.
*   The unpaid balance from the old loan is deducted from the new loan's Net Released amount.
*   A "Rollover clearing payment" is automatically generated to fully pay off and close the old loan.

### Cebuano (Bisaya) Explanation
Kung ang kliyente mangutang og usab (reloan/renewal) samtang wala pa maimpas ang iyang daan nga utang, mo-proseso ang sistema og **Rollover**.
*   Ang nahibiling balanse (unpaid balance) gikan sa daan nga utang ikaltas sa kwarta nga madawat (Net Released) para sa bag-ong utang.
*   Awtomatik nga maghimo og "Rollover clearing payment" ang sistema aron hingpit nga maimpas ug masirado ang daan nga utang.
