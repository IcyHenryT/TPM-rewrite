// Shared constants to avoid magic numbers and strings throughout the bot modules
module.exports = {
  // Inventory slot indices
  SLOT_MAIN_ITEM: 31,            // Main action item slot
  SLOT_CONFIRM_BUTTON: 11,       // "Confirm" button slot
  SLOT_LORE: 13,                 // Slot containing item lore
  SLOT_ALTERNATE_ITEM: 29,       // Alternate item slot used in failsafes
  SLOT_DELIST: 33,               // Slot used when delisting

  // Packet IDs
  CLICK_PACKET_PRIMARY: 371,     // Primary item click
  CLICK_PACKET_SKIP: 159,        // Skip / secondary confirm click

  // Window titles (JSON strings as they appear in the game)
  WINDOW_TITLES: {
    BIN_AUCTION_VIEW: '{"italic":false,"extra":[{"text":"BIN Auction View"}],"text":""}',
    CONFIRM_PURCHASE: '{"italic":false,"extra":[{"text":"Confirm Purchase"}],"text":""}',
    AUCTION_VIEW: '{"italic":false,"extra":[{"text":"Auction View"}],"text":""}'
  },

  // Item names
  ITEMS: {
    GOLD_NUGGET: 'gold_nugget',
    BED: 'bed',
    POTATO: 'potato',
    FEATHER: 'feather',
    GOLD_BLOCK: 'gold_block',
    POISONOUS_POTATO: 'poisonous_potato',
    STAINED_GLASS_PANE: 'stained_glass_pane'
  },

  // Bot states
  STATES: {
    IDLE: 'idle',
    BUYING: 'buying',
    LISTING: 'listing',
    DELISTING: 'delisting',
    EXPIRED: 'expired',
    GETTING_READY: 'getting ready',
    MOVING: 'moving'
  },

  // Misc numerical constants
  MAX_BED_CLICK_ATTEMPTS: 5,     // Attempts to click bed when timing purchase
  BED_SPAM_MAX_UNDEFINED: 5,     // Undefined readings before giving up bed spam
  DEFAULT_DELAY_BETWEEN_CLICKS: 3,
  MIN_DELAY_WITH_SKIP: 150,
  WINDOW_ID_RESET: 100,          // Window ID at which the counter resets
  ITEM_LOAD_TIMEOUT: 1500,       // Timeout for item loading in ms (500ms * 3 from the code)
  BED_SPAM_DELAY: 5000,          // 5 second delay for bed spam check
  WINDOW_CLOSE_DELAY: 500,       // Delay after window operations
  CLICK_RETRY_DELAY: 5,          // Ticks to wait between click retries
  ITEM_LOAD_RETRIES: 3,          // Number of retries for item loading
  COOP_PREVENTION_DELAY: 15      // Ticks to wait for coop prevention
};
