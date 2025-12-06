export const DEFAULT_MAIN_CATEGORIES = [
  { id: '1', name: 'Boende & Hushåll' },
  { id: '2', name: 'Mat & Dryck' },
  { id: '3', name: 'Transport' },
  { id: '4', name: 'Nöje & Fritid' },
  { id: '5', name: 'Shopping & Kläder' },
  { id: '6', name: 'Hälsa & Skönhet' },
  { id: '7', name: 'Barn & Familj' },
  { id: '8', name: 'Sparande & Investeringar' },
  { id: '9', name: 'Inkomster' },
  { id: '10', name: 'Övrigt' }
];

export const DEFAULT_SUB_CATEGORIES = [
  // Boende
  { id: '101', mainCategoryId: '1', name: 'Hyra/Avgift' },
  { id: '102', mainCategoryId: '1', name: 'El & Värme' },
  { id: '103', mainCategoryId: '1', name: 'Försäkring (Hem)' },
  { id: '104', mainCategoryId: '1', name: 'Bredband & TV' },
  { id: '105', mainCategoryId: '1', name: 'Möbler & Inredning' },
  
  // Mat
  { id: '201', mainCategoryId: '2', name: 'Matvarubutik' },
  { id: '202', mainCategoryId: '2', name: 'Restaurang & Takeaway' },
  { id: '203', mainCategoryId: '2', name: 'Systembolaget' },
  { id: '204', mainCategoryId: '2', name: 'Kiosk & Småköp' },

  // Transport
  { id: '301', mainCategoryId: '3', name: 'Drivmedel' },
  { id: '302', mainCategoryId: '3', name: 'Kollektivtrafik' },
  { id: '303', mainCategoryId: '3', name: 'Parkering' },
  { id: '304', mainCategoryId: '3', name: 'Fordonsskatt & Försäkring' },
  { id: '305', mainCategoryId: '3', name: 'Service & Reparation' },

  // Nöje
  { id: '401', mainCategoryId: '4', name: 'Streaming & Abonnemang' },
  { id: '402', mainCategoryId: '4', name: 'Bio & Evenemang' },
  { id: '403', mainCategoryId: '4', name: 'Resor & Hotell' },
  { id: '404', mainCategoryId: '4', name: 'Utekväll' },

  // Shopping
  { id: '501', mainCategoryId: '5', name: 'Kläder & Skor' },
  { id: '502', mainCategoryId: '5', name: 'Elektronik' },
  { id: '503', mainCategoryId: '5', name: 'Sport & Fritid' },
  
  // Hälsa
  { id: '601', mainCategoryId: '6', name: 'Apotek' },
  { id: '602', mainCategoryId: '6', name: 'Sjukvård' },
  { id: '603', mainCategoryId: '6', name: 'Gym & Träning' },
  { id: '604', mainCategoryId: '6', name: 'Frisör & Skönhet' },

  // Barn
  { id: '701', mainCategoryId: '7', name: 'Barnkläder' },
  { id: '702', mainCategoryId: '7', name: 'Leksaker' },
  { id: '703', mainCategoryId: '7', name: 'Barnomsorg' },

  // Inkomster
  { id: '901', mainCategoryId: '9', name: 'Lön' },
  { id: '902', mainCategoryId: '9', name: 'Bidrag' },
  { id: '903', mainCategoryId: '9', name: 'Övrig Inkomst' },
];