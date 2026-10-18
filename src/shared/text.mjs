export function createTextHelpers() {
  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return { normalize, escapeHtml };
}
