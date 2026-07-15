export interface AttachOptions {
  endpoint?: string;
  minimumLength?: number;
}

interface ApiSuggestion {
  word: string;
  pos: string[];
  register: string;
}

export function attachThaiThesaurus(
  editor: HTMLElement,
  options: AttachOptions = {}
): () => void {
  const endpoint = options.endpoint ?? "http://127.0.0.1:8787/api/v1/suggestions";
  const menu = document.createElement("div");
  menu.className = "enone-thesaurus-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  document.body.append(menu);
  let savedRange: Range | null = null;

  const hide = () => { menu.hidden = true; menu.replaceChildren(); };

  const onSelection = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().normalize("NFC").trim() ?? "";
    if (!selection || selection.rangeCount === 0 || text.length < (options.minimumLength ?? 1)) {
      hide(); return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) { hide(); return; }
    savedRange = range.cloneRange();
    const response = await fetch(`${endpoint}?word=${encodeURIComponent(text)}`);
    if (!response.ok) { hide(); return; }
    const body = await response.json() as { suggestions: ApiSuggestion[] };
    if (!body.suggestions.length) { hide(); return; }

    menu.replaceChildren(...body.suggestions.map((suggestion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.innerHTML = `<span>${escapeHtml(suggestion.word)}</span><small>[${escapeHtml(suggestion.pos.join(", "))}] [${escapeHtml(suggestion.register)}]</small>`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (!savedRange) return;
        savedRange.deleteContents();
        savedRange.insertNode(document.createTextNode(suggestion.word));
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: suggestion.word }));
        hide();
      });
      return button;
    }));
    const rect = range.getBoundingClientRect();
    Object.assign(menu.style, {
      left: `${window.scrollX + rect.left}px`,
      top: `${window.scrollY + rect.bottom + 6}px`
    });
    menu.hidden = false;
  };

  editor.addEventListener("mouseup", onSelection);
  editor.addEventListener("keyup", onSelection);
  document.addEventListener("mousedown", hide);
  return () => {
    editor.removeEventListener("mouseup", onSelection);
    editor.removeEventListener("keyup", onSelection);
    document.removeEventListener("mousedown", hide);
    menu.remove();
  };
}

function escapeHtml(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
