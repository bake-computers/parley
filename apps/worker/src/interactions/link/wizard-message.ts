export function isSnowflake(value: string | undefined): value is string {
  return value !== undefined && /^\d+$/u.test(value);
}

/** Append wizard message id as a path segment (Discord custom_id avoids `?` query params). */
export function withWizardMessageSegment(baseCustomId: string, wizardMessageId: string): string {
  return `${baseCustomId}/${wizardMessageId}`;
}

export function parseWizardMessageIdFromPath(segments: readonly string[], index: number): string | undefined {
  const value = segments[index];
  return isSnowflake(value) ? value : undefined;
}

/** Legacy modals opened with `?msg=` before path-segment encoding. */
export function parseWizardMessageIdParam(params: URLSearchParams): string | undefined {
  const value = params.get("msg");
  return isSnowflake(value ?? undefined) ? value : undefined;
}