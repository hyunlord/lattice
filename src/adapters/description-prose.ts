/** Attribution, license notices and URLs are evidence, not statements of a module's purpose. */
export function descriptiveProse(value: string): boolean {
    const text = value.trim();
    if (/copyright|spdx-license|licensed under|all rights reserved|permission is hereby granted|\b(?:MIT|ISC|BSD|Apache|GPL|Mozilla)\s+Licen[cs]e\b|©/iu.test(text)) return false;
    if (/^(?:(?:the\s+)?(?:original\s+)?(?:work|code|implementation)\s+(?:was|is)\s+)?(?:ported|inlined|adapted|copied|derived|borrowed)\s+from\b|^(?:source|upstream|reference):\s*https?:/iu.test(text)) return false;
    return /\p{L}/u.test(text.replace(/https?:\/\/\S+/gu, "").replace(/\[[^\]]*\]\([^)]*\)/gu, ""));
}
