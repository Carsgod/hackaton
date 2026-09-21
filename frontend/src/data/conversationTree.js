export const DEMO_TREE_EN = {
  root: {
    agent: 'Good afternoon, welcome to MTN service center. How can I help you today?',
    options: [
      { label: 'I sent money to my sister', next: 'sister' },
      { label: 'I have a billing issue', next: 'billing_auth' },
      { label: 'I need help with a transaction', next: 'transaction' }
    ]
  },
  sister: {
    agent: 'I\'m sorry to hear that. Let me check the transaction for you. Can you tell me the phone number you sent to?',
    options: [
      { label: '0595759917', next: 'refund' },
      { label: 'I don\'t have the number right now', next: 'refund' },
      { label: 'It was 0595759917', next: 'refund' }
    ]
  },
  account: {
    agent: 'Okay, what seems to be the issue with your account?',
    options: [
      { label: 'My balance is incorrect', next: 'balance' },
      { label: 'I can\'t access my account', next: 'access' },
      { label: 'There is an unauthorized charge', next: 'unauthorized' }
    ]
  },
  transaction: {
    agent: 'Which transaction are you having issues with?',
    options: [
      { label: 'A MoMo transfer', next: 'momo' },
      { label: 'A bank deposit', next: 'bank' },
      { label: 'A bill payment', next: 'bill' }
    ]
  },
  refund: {
    agent: 'Thank you. I can see the transaction. Reference number is REF88321. It shows fifty Ghana cedis was debited from your account on September twelfth at three forty five PM. The transaction is currently pending on the receiver side.',
    options: [
      { label: 'What should I do?', next: 'reverse' },
      { label: 'Will the money come back?', next: 'reverse' },
      { label: 'Can you reverse it?', next: 'reverse' }
    ]
  },
  reverse: {
    agent: 'I can initiate a reversal for you. The amount is fifty Ghana cedis. Do you approve the refund?',
    options: [
      { label: 'Yes, please reverse it', next: 'complete' },
      { label: 'I want a refund', next: 'complete' },
      { label: 'How long will it take?', next: 'complete' }
    ]
  },
  complete: {
    agent: 'I have approved the refund. Your money will be returned to your mobile money wallet within twenty-four hours. Your case number is CASE45678. An SMS confirmation has been sent to your phone number ending in nine zero.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Thank you so much', next: 'end' },
      { label: 'How do I track the refund?', next: 'end' }
    ]
  },
  end: {
    agent: 'You\'re welcome. If you have any other issues, please don\'t hesitate to visit us. Have a great day.',
    options: []
  },
  balance: {
    agent: 'I can see your recent transactions. There is a pending debit of fifty Ghana cedis that should reflect within a few hours.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'How long does it take?', next: 'pending_info' },
      { label: 'Can you cancel it?', next: 'cancel' }
    ]
  },
  access: {
    agent: 'Let me verify your identity. Can you confirm your registered phone number?',
    options: [
      { label: '0595759917', next: 'verified' },
      { label: 'I don\'t remember it', next: 'verified' },
      { label: 'It starts with 059', next: 'verified' }
    ]
  },
  unauthorized: {
    agent: 'I have flagged that charge for review. It may take twenty-four to forty-eight hours to investigate.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Will I get a refund?', next: 'refund_info' },
      { label: 'How do I prevent this?', next: 'prevent' }
    ]
  },
  momo: {
    agent: 'I can see your MoMo transfer. What is the recipient\'s number?',
    options: [
      { label: '0595759917', next: 'refund' },
      { label: 'I don\'t know it', next: 'refund' },
      { label: 'It was 0595759917', next: 'refund' }
    ]
  },
  bank: {
    agent: 'Bank deposits can take up to twenty-four hours to appear. Can you share the deposit reference?',
    options: [
      { label: 'REF88321', next: 'refund' },
      { label: 'I don\'t have it', next: 'refund' },
      { label: 'It was this morning', next: 'refund' }
    ]
  },
  bill: {
    agent: 'Bill payments are usually instant. Can you confirm the amount and service provider?',
    options: [
      { label: 'fifty Ghana cedis to ECG', next: 'refund' },
      { label: 'one hundred Ghana cedis to GWCL', next: 'refund' },
      { label: 'I don\'t remember', next: 'refund' }
    ]
  },
  pending_info: {
    agent: 'Most pending debits clear within two to four hours. If it does not, please contact us again.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Okay, I will wait', next: 'end' }
    ]
  },
  cancel: {
    agent: 'Cancellation depends on the merchant. I have escalated this and will update you within twenty-four hours.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'How do I check the status?', next: 'status' }
    ]
  },
  verified: {
    agent: 'Thank you. Your identity has been verified. How can I assist you further?',
    options: [
      { label: 'I still can\'t access my account', next: 'access' },
      { label: 'I need to reset my PIN', next: 'pin' },
      { label: 'Thank you', next: 'end' }
    ]
  },
  pin: {
    agent: 'I have sent a PIN reset link to your registered number. Please check your messages.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'I did not receive it', next: 'verified' }
    ]
  },
  refund_info: {
    agent: 'If the investigation finds the charge was unauthorized, the refund will be processed within 48 hours.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'How will I know?', next: 'notification' }
    ]
  },
  prevent: {
    agent: 'You can enable transaction alerts and use a separate wallet for small daily expenses.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'How do I enable alerts?', next: 'alerts' }
    ]
  },
  status: {
    agent: 'You can check the status anytime in the app under Help and Support.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Okay', next: 'end' }
    ]
  },
  notification: {
    agent: 'You will receive an SMS and email once the refund is processed.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Okay', next: 'end' }
    ]
  },
  alerts: {
    agent: 'Go to Settings, then Notifications, and turn on Transaction Alerts.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Okay', next: 'end' }
    ]
  },
  billing_auth: {
    agent: 'I\'ll help you with your billing issue. First, I need to verify your identity for security. Can you confirm your full name, registered phone number, and national ID or passport number?',
    options: [
      { label: 'Verified: Augustine Nana, 0595759917, GHA-156438876-9', next: 'billing_last_txn' },
      { label: 'I don\'t have my ID right now', next: 'billing_verify_later' },
      { label: 'Can you check my account first?', next: 'billing_type' }
    ]
  },
  billing_verify_later: {
    agent: 'No problem. I can proceed with basic verification using your registered phone number. What type of billing issue are you experiencing?',
    options: [
      { label: 'Overcharging or incorrect balance', next: 'billing_overcharge' },
      { label: 'Unrecognized airtime or data deduction', next: 'billing_vas' },
      { label: 'A MoMo transaction error', next: 'billing_momo' }
    ]
  },
  billing_last_txn: {
    agent: 'Thank you. For additional security, can you tell me the last three transactions on your account? This helps me verify your identity before accessing billing details.',
    options: [
      { label: 'Airtime top-up twenty Ghana cedis, Data bundle fifteen Ghana cedis, MoMo send fifty Ghana cedis', next: 'billing_type' },
      { label: 'I don\'t remember exactly', next: 'billing_type' },
      { label: 'Can we skip this?', next: 'billing_type' }
    ]
  },
  billing_type: {
    agent: 'Thank you for verifying. What type of billing issue are you experiencing?',
    options: [
      { label: 'Overcharging or incorrect balance', next: 'billing_overcharge' },
      { label: 'Unrecognized airtime or data deduction', next: 'billing_vas' },
      { label: 'A MoMo transaction error', next: 'billing_momo' }
    ]
  },
  billing_overcharge: {
    agent: 'I can review your last three billing cycles. Is this about an overcharge on your airtime, data, or a specific subscription?',
    options: [
      { label: 'It\'s an airtime overcharge', next: 'billing_airtime' },
      { label: 'It\'s a data charge', next: 'billing_data' },
      { label: 'It\'s a subscription I didn\'t sign up for', next: 'billing_vas' }
    ]
  },
  billing_airtime: {
    agent: 'I can see a pending airtime adjustment of twenty Ghana cedis. I will initiate a direct reversal to your wallet. Your case number is BILL78901.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'How long will it take?', next: 'billing_timeline' }
    ]
  },
  billing_data: {
    agent: 'Your last data charge appears to be from an automatic renewal. I will deactivate the auto-renewal and process a fifteen Ghana cedis data refund. Your case number is BILL78902.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'Will this happen again?', next: 'billing_prevent' }
    ]
  },
  billing_vas: {
    agent: 'I found an active value-added service subscription. I will deactivate it now to stop future automated charges. Do you also want a goodwill data bonus for the inconvenience?',
    options: [
      { label: 'Yes, please deactivate it and add a bonus', next: 'billing_bonus' },
      { label: 'Just deactivate it, no bonus needed', next: 'billing_case' },
      { label: 'I want a full refund instead', next: 'billing_refund' }
    ]
  },
  billing_momo: {
    agent: 'I can see the MoMo transaction. What was the issue—unauthorized deduction, failed transaction, or incorrect amount? Also, please confirm the transaction ID if you have it.',
    options: [
      { label: 'Unauthorized deduction, TXN ID: MOM789456', next: 'billing_momo_verify' },
      { label: 'Failed transaction but money was taken', next: 'billing_momo_verify' },
      { label: 'Incorrect amount sent', next: 'billing_reverse' }
    ]
  },
  billing_momo_verify: {
    agent: 'Thank you. I have located the transaction in the MoMo database. The debit of fifty Ghana cedis is confirmed. Before I process the refund, I need to confirm: are you a prepaid or postpaid customer?',
    options: [
      { label: 'Prepaid', next: 'billing_refund' },
      { label: 'Postpaid', next: 'billing_postpaid' }
    ]
  },
  billing_postpaid: {
    agent: 'For postpaid accounts, the refund will be applied as a credit note on your upcoming bill. This will lower your net payable amount. Your case number is BILL78906.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'How long until it appears?', next: 'billing_timeline' }
    ]
  },
  billing_reverse: {
    agent: 'I have initiated a reversal for the incorrect amount. The funds will return to your wallet within twenty-four hours. Your case number is BILL78903.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'How will I know?', next: 'billing_notification' }
    ]
  },
  billing_refund: {
    agent: 'I have approved a refund of fifty Ghana cedis to your mobile money wallet. Your case number is BILL78904. An SMS confirmation has been sent to your phone.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'How do I check the status?', next: 'billing_status' }
    ]
  },
  billing_bonus: {
    agent: 'The subscription has been deactivated. I have also added a five hundred megabytes goodwill data bonus to your account. Your case number is BILL78905.',
    options: [
      { label: 'Thank you', next: 'billing_case' },
      { label: 'Will I be charged again?', next: 'billing_prevent' }
    ]
  },
  billing_case: {
    agent: 'I have logged your case in our CRM system under Billing Dispute. You will receive an SMS with your ticket number. Is there anything else I can help you with?',
    options: [
      { label: 'No, thank you', next: 'end' },
      { label: 'Can I speak to a supervisor?', next: 'billing_escalate' }
    ]
  },
  billing_escalate: {
    agent: 'I can escalate this to our back-office finance team. They will contact you within twenty-four hours with a detailed resolution. Your escalation reference is ESC78910.',
    options: [
      { label: 'Thank you', next: 'end' },
      { label: 'Okay', next: 'end' }
    ]
  },
  billing_timeline: {
    agent: 'Reversals usually take twenty-four to forty-eight hours to reflect. You will receive an SMS confirmation once it is complete.',
    options: [
      { label: 'Thank you', next: 'billing_case' }
    ]
  },
  billing_prevent: {
    agent: 'To prevent future charges, go to Settings, then Subscriptions, and turn off auto-renewal. You can also enable transaction alerts.',
    options: [
      { label: 'Thank you', next: 'billing_case' }
    ]
  },
  billing_notification: {
    agent: 'You will receive an SMS and email once the refund is processed. You can also track it in the app under My Transactions.',
    options: [
      { label: 'Thank you', next: 'billing_case' }
    ]
  },
  billing_status: {
    agent: 'You can check the status anytime in the app under Help and Support, or using your case number BILL78904.',
    options: [
      { label: 'Thank you', next: 'billing_case' }
    ]
  }
}

export const DEMO_TREE_TWI = {
  root: {
    agent: 'Ahobrasee, akwaaba wɔ MTN service center no. Dɛn na metumi ayɛ wo nnɛ?',
    options: [
      { label: 'Mɛtrɛɛ sika kɔɔ me nuabea nkyɛn', next: 'sister' },
      { label: 'Me billing no nya asɛm', next: 'billing_auth' },
      { label: 'Mehia transaction ho ɔkɔmfo', next: 'transaction' }
    ]
  },
  sister: {
    agent: 'Mente ase. Ma me hwɛ transaction no. Bɛtumi ka wo telefon number no a wokɔɔ hɔ no?',
    options: [
      { label: '0595759917', next: 'refund' },
      { label: 'Minim number no seesei', next: 'refund' },
      { label: 'Na ɛyɛ 0595759917', next: 'refund' }
    ]
  },
  account: {
    agent: 'Yoo, dɛn na ɛyɛ wo account no ho asɛm?',
    options: [
      { label: 'Me balance no nyɛ papa', next: 'balance' },
      { label: 'Mentumi nkɔ me account mu', next: 'access' },
      { label: 'Nipa bi de me sika kɔɔ', next: 'unauthorized' }
    ]
  },
  transaction: {
    agent: 'Transaction bɛn na wowɔ ɔhaw no ho?',
    options: [
      { label: 'MoMo transfer', next: 'momo' },
      { label: 'Bank deposit', next: 'bank' },
      { label: 'Bill payment', next: 'bill' }
    ]
  },
  refund: {
    agent: 'Medaase. Mɛ hu transaction no. Reference number yɛ REF88321. Ɛkyerɛ sɛ Ghana cedis ahahanu bɔɔ wo ka wɔ September twelfth, three forty five PM. Transaction no da so wɔ receiver nkyɛn.',
    options: [
      { label: 'Dɛn na menyɛ?', next: 'reverse' },
      { label: 'Sika no bɛsan aba?', next: 'reverse' },
      { label: 'Bɛtumi asan nkɔma me?', next: 'reverse' }
    ]
  },
  reverse: {
    agent: 'Metumi asan nkɔma wo. Sika no yɛ fifty Ghana cedis. Wopɛ sɛ me ma refund?',
    options: [
      { label: 'Aane, ma me refund', next: 'complete' },
      { label: 'Mepɛ refund', next: 'complete' },
      { label: 'Ɛbɛtwa ahe?', next: 'complete' }
    ]
  },
  complete: {
    agent: 'Mɛma refund no. Wo sika bɛsan aba wo mobile money wallet mu wɔ nnɔnhwerehahanu mu. Wo case number yɛ CASE45678. SMS confirmation no akɔ wo telefon number a ɛwɔ nine zero no.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Medaase pii', next: 'end' },
      { label: 'Ɛbɛtwa ahe?', next: 'end' }
    ]
  },
  end: {
    agent: 'Yɛ akyekyerɛ. Sɛ wo wɔ nsɛm foforo bi a, ɛnsɛ sɛ wo ho yɛ hu. Da biara wo nsa.',
    options: []
  },
  balance: {
    agent: 'Metumi ahwɛ wo transaction a wɔayɛ nnɛ. Debit a ɛretwɛn yɛ fifty Ghana cedis na ɛbɛda so pɛn.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Ɛbɛtwa ahe?', next: 'pending_info' },
      { label: 'Bɛtumi atwa?', next: 'cancel' }
    ]
  },
  access: {
    agent: 'Ma me hwɛ wo identity. Bɛtumi ka wo telefon number a woakyerɛw no?',
    options: [
      { label: '0595759917', next: 'verified' },
      { label: 'Minim no', next: 'verified' },
      { label: 'Na ɛfiri 059', next: 'verified' }
    ]
  },
  unauthorized: {
    agent: 'Mɛma charge no ahwɛ. Ɛbɛtwa nnɔnhwerehahanu kosi nnɔnhwere aduonum-nwɔtwe.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Sika no bɛsan aba?', next: 'refund_info' },
      { label: 'Ɔkwan bɛn so na metumi agyina?', next: 'prevent' }
    ]
  },
  momo: {
    agent: 'Metumi ahwɛ wo MoMo transfer no. Recipient number no yɛ dɛn?',
    options: [
      { label: '0595759917', next: 'refund' },
      { label: 'Minim no', next: 'refund' },
      { label: 'Na ɛyɛ 0595759917', next: 'refund' }
    ]
  },
  bank: {
    agent: 'Bank deposits no bɛtwa nnɔnhwerehahanu. Bɛtumi ka deposit reference no?',
    options: [
      { label: 'REF88321', next: 'refund' },
      { label: 'Minim no', next: 'refund' },
      { label: 'Na ɛyɛ anɔpa yi', next: 'refund' }
    ]
  },
  bill: {
    agent: 'Bill payments no yɛ ntɛmntɛm. Bɛtumi ka amount ne service provider no?',
    options: [
      { label: 'fifty Ghana cedis kɔ ECG', next: 'refund' },
      { label: 'one hundred Ghana cedis kɔ GWCL', next: 'refund' },
      { label: 'Minim no', next: 'refund' }
    ]
  },
  pending_info: {
    agent: 'Pending debits no bɛtwa nnɔnhwere mmienu kosi nnɔnhwere ɛnan. Sɛ ɛnyɛ saa a, frɛ yɛn bio.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Yoo, mɛtwɛn', next: 'end' }
    ]
  },
  cancel: {
    agent: 'Ɔkɔmfo no tumi atwa. Mɛma ɛyɛ ɔhaw no na ɛbɛba wo nkyɛn wɔ nnɔnhwerehahanu mu.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Ɔkwan bɛn so na mɛhwɛ?', next: 'status' }
    ]
  },
  verified: {
    agent: 'Medaase. Wo identity no ayɛ nokware. Dɛn na metumi ayɛ bio?',
    options: [
      { label: 'Mentumi nkɔ me account mu', next: 'access' },
      { label: 'Mepɛ PIN reset', next: 'pin' },
      { label: 'Medaase', next: 'end' }
    ]
  },
  pin: {
    agent: 'Mɛsoma PIN reset link kɔ wo number no. Hwɛ wo messages.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Minnaa', next: 'verified' }
    ]
  },
  refund_info: {
    agent: 'Sɛ ɔhaw no yɛ nokware a, refund no bɛba wɔ 48 nnɔnhwere mu.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Ɛbɛtwa ahe?', next: 'notification' }
    ]
  },
  prevent: {
    agent: 'Tumi yɛ transaction alerts na fa pocket foforo ma wo sika ketewa.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Ɔkwan bɛn so na mɛyɛ alerts?', next: 'alerts' }
    ]
  },
  status: {
    agent: 'Bɛtumi ahwɛ no wɔ app no mu wɔ Help and Support ase.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Yoo', next: 'end' }
    ]
  },
  notification: {
    agent: 'Wo bɛnya SMS ne email sɛ refund no bae.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Yoo', next: 'end' }
    ]
  },
  alerts: {
    agent: 'Kɔ Settings, na yɛ Notifications, na hyɛ Transaction Alerts no.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Yoo', next: 'end' }
    ]
  },
  billing_auth: {
    agent: 'Mɛboa wo wɔ wo billing ho asɛm no ho. Kɔkɔɔ, ɛsɛ sɛ me hwɛ wo identity. Bɛtumi ka wo din, wo telefon number, ne national ID anaa passport number?',
    options: [
      { label: 'Augustine Nana, 0595759917, GHA-156438876-9', next: 'billing_last_txn' },
      { label: 'Minim me ID seesei', next: 'billing_verify_later' },
      { label: 'Hwɛ me account ansa', next: 'billing_type' }
    ]
  },
  billing_verify_later: {
    agent: 'Ɛnyɛ ɔhaw. Metumi akɔ so de wo telefon number a wakyerɛw no. Billing asɛm bɛn na wowɔ?',
    options: [
      { label: 'Overcharging anaa balance a ɛnyɛ nokware', next: 'billing_overcharge' },
      { label: 'Airtime anaa data a mintii nkae', next: 'billing_vas' },
      { label: 'MoMo transaction error', next: 'billing_momo' }
    ]
  },
  billing_last_txn: {
    agent: 'Medaase. Sɛ ɛhɔ na ɛsɛ sɛ me hwɛ wo last three transactions. Bɛtumi ka wo nnɛɛnnɛɛ transactions a wɔayɛ?',
    options: [
      { label: 'Airtime top-up twenty Ghana cedis, Data bundle fifteen Ghana cedis, MoMo send fifty Ghana cedis', next: 'billing_type' },
      { label: 'Minim no pasaa', next: 'billing_type' },
      { label: 'Yɛn nkɔ so', next: 'billing_type' }
    ]
  },
  billing_type: {
    agent: 'Medaase sɛ woahwɛ. Billing asɛm bɛn na wowɔ?',
    options: [
      { label: 'Overcharging anaa balance a ɛnyɛ nokware', next: 'billing_overcharge' },
      { label: 'Airtime anaa data a mintii nkae', next: 'billing_vas' },
      { label: 'MoMo transaction error', next: 'billing_momo' }
    ]
  },
  billing_overcharge: {
    agent: 'Metumi ahwɛ wo billing cycles a atwam no. Ɛyɛ airtime, data, anaa subscription ho asɛm?',
    options: [
      { label: 'Airtime overcharge', next: 'billing_airtime' },
      { label: 'Data charge', next: 'billing_data' },
      { label: 'Subscription a mintii nkae', next: 'billing_vas' }
    ]
  },
  billing_airtime: {
    agent: 'Mɛhu airtime adjustment a ɛretwɛn yɛ twenty Ghana cedis. Mɛma reversal no kɔ wo wallet. Wo case number yɛ BILL78901.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Ɛbɛtwa ahe?', next: 'billing_timeline' }
    ]
  },
  billing_data: {
    agent: 'Wo data charge no yɛ automatic renewal. Mɛtwa auto-renewal no na mɛma fifteen Ghana cedis refund. Wo case number yɛ BILL78902.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Ɛbɛba bio?', next: 'billing_prevent' }
    ]
  },
  billing_vas: {
    agent: 'Mɛhu VAS subscription a ɛredidi. Mɛtwa no seesei. Wopɛ goodwill data bonus anaa?',
    options: [
      { label: 'Yoo, ma me bonus', next: 'billing_bonus' },
      { label: 'Twa no nko', next: 'billing_case' },
      { label: 'Mepɛ full refund', next: 'billing_refund' }
    ]
  },
  billing_momo: {
    agent: 'Mɛhu MoMo transaction no. Ɛyɛ unauthorized deduction, failed transaction, anaa amount a ɛnyɛ nokware? Also, bɛtumi ka transaction ID no?',
    options: [
      { label: 'Unauthorized deduction, TXN ID: MOM789456', next: 'billing_momo_verify' },
      { label: 'Failed transaction na wɔgyee me sika', next: 'billing_momo_verify' },
      { label: 'Amount a ɛnyɛ nokware', next: 'billing_reverse' }
    ]
  },
  billing_momo_verify: {
    agent: 'Medaase. Mɛhu transaction no wɔ MoMo database. Debit a ɛyɛ fifty Ghana cedis ayɛ nokware. Before I process refund no, bɛtumi ka wo account type—prepaid anaa postpaid?',
    options: [
      { label: 'Prepaid', next: 'billing_refund' },
      { label: 'Postpaid', next: 'billing_postpaid' }
    ]
  },
  billing_postpaid: {
    agent: 'For postpaid accounts, refund no bɛba wo upcoming bill a ɛbɛba no so. Ɛbɛma wo net payable no so. Wo case number yɛ BILL78906.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Ɛbɛtwa ahe?', next: 'billing_timeline' }
    ]
  },
  billing_reverse: {
    agent: 'Mɛma reversal no. Sika no bɛsan aba wo wallet wɔ nnɔnhwerehahanu mu. Wo case number yɛ BILL78903.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Ɛbɛtwa ahe?', next: 'billing_notification' }
    ]
  },
  billing_refund: {
    agent: 'Mɛma fifty Ghana cedis refund kɔ wo mobile money wallet. Wo case number yɛ BILL78904. SMS confirmation no akɔ wo telefon.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Ɔkwan bɛn so na mɛhwɛ?', next: 'billing_status' }
    ]
  },
  billing_bonus: {
    agent: 'Mɛtwa subscription no na matɔ five hundred megabytes goodwill data bonus kɔ wo account. Wo case number yɛ BILL78905.',
    options: [
      { label: 'Medaase', next: 'billing_case' },
      { label: 'Wɔbɛbɔ me bio?', next: 'billing_prevent' }
    ]
  },
  billing_case: {
    agent: 'Mɛkyerɛw wo case wɔ CRM no mu wɔ Billing Dispute. Wo bɛnya SMS a ɛwɔ wo ticket number. Ɔkwan foforo bi a metumi ayɛ?',
    options: [
      { label: 'Dabi, medaase', next: 'end' },
      { label: 'Mepɛ supervisor', next: 'billing_escalate' }
    ]
  },
  billing_escalate: {
    agent: 'Mɛma no kɔ back-office finance team no. Wɔbɛfrɛ wo wɔ nnɔnhwerehahanu mu. Wo escalation reference yɛ ESC78910.',
    options: [
      { label: 'Medaase', next: 'end' },
      { label: 'Yoo', next: 'end' }
    ]
  },
  billing_timeline: {
    agent: 'Reversals no bɛtwa nnɔnhwerehahanu kosi nnɔnhwere aduonum-nwɔtwe. Wo bɛnya SMS sɛ ɛba.',
    options: [
      { label: 'Medaase', next: 'billing_case' }
    ]
  },
  billing_prevent: {
    agent: 'Kɔ Settings, na yɛ Subscriptions, na twa auto-renewal no. Tumi nso ayɛ transaction alerts.',
    options: [
      { label: 'Medaase', next: 'billing_case' }
    ]
  },
  billing_notification: {
    agent: 'Wo bɛnya SMS ne email sɛ refund no bae. Bɛtumi ahwɛ no wɔ app no mu wɔ My Transactions ase.',
    options: [
      { label: 'Medaase', next: 'billing_case' }
    ]
  },
  billing_status: {
    agent: 'Bɛtumi ahwɛ no wɔ app no mu wɔ Help and Support, anaa de wo case number BILL78904.',
    options: [
      { label: 'Medaase', next: 'billing_case' }
    ]
  }
}

export function extractCards(text) {
  const cards = []
  let cardIndex = 0
  const refMatch = text.match(/reference\s+number\s+is\s+([A-Z0-9]+)/i)
  if (refMatch) cards.push({ id: `card_ref_${refMatch[1]}`, type: 'reference', label: 'Reference', value: refMatch[1], icon: '🔢' })
  const caseMatch = text.match(/case\s+number\s+is\s+([A-Z0-9]+)/i)
  if (caseMatch) cards.push({ id: `card_case_${caseMatch[1]}`, type: 'reference', label: 'Case Number', value: caseMatch[1], icon: '📋' })
  if (/\b(?:approve|reversal|refund)\b/i.test(text)) cards.push({ id: `card_action_${cardIndex++}`, type: 'action', label: 'Action', value: 'Refund Approved', icon: '✅' })
  const amountMatch = text.match(/(?:GHS\s+)?(fifty|twenty|fifteen|one hundred|five hundred)\s+Ghana\s+cedis|GHS\s+(\d+(?:\.\d{1,2})?)/i)
  if (amountMatch) {
    const amountValue = amountMatch[1] ? amountMatch[1] + ' Ghana cedis' : 'GHS ' + amountMatch[2]
    cards.push({ id: `card_amount_${cardIndex++}`, type: 'amount', label: 'Amount', value: amountValue, icon: '💳' })
  }
  return cards
}

const TREE_TRANSLATION_CACHE = {}

export async function getTree(language = 'en') {
  if (language === 'en') return DEMO_TREE_EN
  if (language === 'tw') return DEMO_TREE_TWI
  if (TREE_TRANSLATION_CACHE[language]) return TREE_TRANSLATION_CACHE[language]
  const baseUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
  const url = `${baseUrl}/api/translate/tree`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree: DEMO_TREE_EN, target_language: language })
    })
    if (!response.ok) throw new Error(`Translation failed: ${response.status}`)
    const data = await response.json()
    const translated = data.tree || DEMO_TREE_EN
    TREE_TRANSLATION_CACHE[language] = translated
    return translated
  } catch (error) {
    console.error('Failed to load translated tree', error)
    return DEMO_TREE_EN
  }
}
