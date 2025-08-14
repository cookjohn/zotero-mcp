import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { ItemReader } from "./itemReader";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [
        {
          dataKey: "title",
          label: getString("prefs-table-title"),
          fixedWidth: true,
          width: 100,
        },
      ],
      rows: [
        {
          title: "Orange",
        },
        {
          title: "Banana",
        },
        {
          title: "Apple",
        },
      ],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  updatePrefsUI();
  bindPrefEvents();
}

async function updatePrefsUI() {
  // You can initialize some UI elements on prefs window
  // with addon.data.prefs.window.document
  // Or bind some events to the elements
  const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
  if (addon.data.prefs?.window == undefined) return;
  const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
    .setContainerId(`${config.addonRef}-table-container`)
    .setProp({
      id: `${config.addonRef}-prefs-table`,
      // Do not use setLocale, as it modifies the Zotero.Intl.strings
      // Set locales directly to columns
      columns: addon.data.prefs?.columns,
      showHeader: true,
      multiSelect: true,
      staticColumns: true,
      disableFontSizeScaling: true,
    })
    .setProp("getRowCount", () => addon.data.prefs?.rows.length || 0)
    .setProp(
      "getRowData",
      (index) =>
        addon.data.prefs?.rows[index] || {
          title: "no data",
        },
    )
    // Show a progress window when selection changes
    .setProp("onSelectionChange", (selection) => {
      new ztoolkit.ProgressWindow(config.addonName)
        .createLine({
          text: `Selected line: ${addon.data.prefs?.rows
            .filter((v, i) => selection.isSelected(i))
            .map((row) => row.title)
            .join(",")}`,
          progress: 100,
        })
        .show();
    })
    // When pressing delete, delete selected line and refresh table.
    // Returning false to prevent default event.
    .setProp("onKeyDown", (event: KeyboardEvent) => {
      if (event.key == "Delete" || (Zotero.isMac && event.key == "Backspace")) {
        addon.data.prefs!.rows =
          addon.data.prefs?.rows.filter(
            (v, i) => !tableHelper.treeInstance.selection.isSelected(i),
          ) || [];
        tableHelper.render();
        return false;
      }
      return true;
    })
    // For find-as-you-type
    .setProp(
      "getRowString",
      (index) => addon.data.prefs?.rows[index].title || "",
    )
    // Render the table.
    .render(-1, () => {
      renderLock.resolve();
    });
  await renderLock.promise;
  ztoolkit.log("Preference table rendered!");
}

function bindPrefEvents() {
  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-enable`,
    )
    ?.addEventListener("command", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as XUL.Checkbox).checked}!`,
      );
    });

  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-input`,
    )
    ?.addEventListener("change", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as HTMLInputElement).value}!`,
      );
    });

  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-read-selected`,
    )
    ?.addEventListener("command", () => {
      ItemReader.readSelectedItems();
    });

  const portInput = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-mcp-server-port`
  ) as HTMLInputElement;
  portInput?.addEventListener("change", () => {
    if (portInput) {
      const port = parseInt(portInput.value, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        portInput.value = Zotero.Prefs.get("mcp.server.port")!.toString();
        addon.data.prefs!.window.alert(getString("pref-server-port-invalid" as any));
      }
    }
  });

  const defaultFieldsSelect = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-mcp-server-defaultFields`
  ) as HTMLSelectElement;
  defaultFieldsSelect?.addEventListener("change", () => {
    const selectedOptions = Array.from(defaultFieldsSelect.selectedOptions).map(
      (option) => (option as HTMLOptionElement).value
    );
    Zotero.Prefs.set("mcp.server.defaultFields", JSON.stringify(selectedOptions));
  });

  // Initialize defaultFieldsSelect with stored preferences
  const storedFields = Zotero.Prefs.get("mcp.server.defaultFields");
  if (storedFields && defaultFieldsSelect) {
    const fields = JSON.parse(storedFields as string);
    Array.from(defaultFieldsSelect.options).forEach((option) => {
      const htmlOption = option as HTMLOptionElement;
      if (fields.includes(htmlOption.value)) {
        htmlOption.selected = true;
      }
    });
  }
}
