/**
 * Clipboard write with a legacy fallback.
 *
 * Shared by the pin popover's Generate Fix Code action and the opportunity
 * card's Export to Issue action. Both need the same failure behaviour, so the
 * toast copy stays truthful when the write is refused.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the textarea path. */
  }

  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.setAttribute('readonly', 'true');
    holder.style.position = 'fixed';
    holder.style.opacity = '0';
    holder.style.pointerEvents = 'none';
    document.body.appendChild(holder);
    holder.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(holder);
    return copied;
  } catch {
    return false;
  }
}
