// Shared constants to avoid magic numbers throughout the bot modules
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

  // Misc numerical constants
  MAX_BED_CLICK_ATTEMPTS: 5,     // Attempts to click bed when timing purchase
  BED_SPAM_MAX_UNDEFINED: 5,     // Undefined readings before giving up bed spam
  DEFAULT_DELAY_BETWEEN_CLICKS: 3,
  MIN_DELAY_WITH_SKIP: 150,
};
