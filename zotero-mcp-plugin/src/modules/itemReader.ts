export class ItemReader {
  static readSelectedItems() {
    const pane = Zotero.getActiveZoteroPane();
    const items = pane.getSelectedItems();
    if (!items.length) {
      Zotero.alert(pane.window, "Zotero Plugin", "No items selected");
      return;
    }

    const titles = items.map((item: Zotero.Item) => item.getDisplayTitle());
    Zotero.alert(pane.window, "Selected Items", titles.join("\n"));
  }
}
