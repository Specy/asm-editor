# Invented names are frozen words derived from file addresses

Where an Executable has no symbol, the Listing invents a name with Ghidra's prefix and made-up words instead of an address (`FUN_brave_otter`, not `FUN_00401136`), because words are quicker to spot and to talk about than hex. The Listing is never saved, so a name is derived from the function's link-time address in the file, the same on every open and for everyone, and independent of where the program is loaded; a clash goes to the later address, which takes the next name in a fixed sequence. The word lists and the derivation are versioned and never edited in place, because changing them renames every function in every saved Project and breaks every note that mentions one. The words are adjective and animal pairs chosen to read as obviously meaningless: none sounds like a finding (`key`, `flag`, `check`) or an instruction (`push`, `test`, `loop`).

## Considered options

- **Ghidra's address names** (`FUN_00401136`). They match Ghidra and gdb at a glance, but they are hard to tell apart and remember. The address stays visible in the Listing's address column and in the label's hover.
- **Names drawn at random**, as name generators do. They would change on every open and differ between two people looking at the same binary.
