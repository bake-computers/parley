import { ComponentType } from "discord-api-types/v10";

/**
 * Raw data for a single component inside a modal submission, as extracted from
 * Discord's action-row structure.
 */
export interface ModalFieldData {
  /** The developer-defined identifier for this component. */
  custom_id: string;
  /** The Discord component type (e.g. text input, select menu). */
  type: ComponentType;
  /** The submitted text value for text-input components. */
  value?: string;
  /** The submitted selected values for select-menu components. */
  values?: string[];
}

/**
 * Resolves typed values from the component data of a modal-submit interaction.
 *
 * Components are flattened from their action-row wrappers and indexed by
 * `custom_id` at construction time, making all `get*()` and `fieldExists()`
 * calls O(1) instead of O(n).
 *
 * @example
 * ```ts
 * const resolver = new ModalComponentResolver(interaction.data.components);
 * const name = resolver.getString("name-input", true);
 * const tags = resolver.getSelectedValues("tags-select");
 * ```
 */
export class ModalComponentResolver {
  /**
   * Flat list of all components extracted from the modal's action rows.
   * Exposed via {@link data} for iteration; use the typed accessors for lookups.
   */
  private fields: ModalFieldData[] = [];

  /**
   * Index of modal fields keyed by `custom_id` for O(1) lookups.
   * Populated during construction alongside the `fields` array.
   */
  private fieldsMap: Map<string, ModalFieldData> = new Map();

  /**
   * @param {readonly unknown[]} components - The raw `components` array from the modal-submit
   *   interaction data, which is a list of action-row objects each containing
   *   an inner `components` array.
   */
  constructor(components: readonly unknown[]) {
    for (const row of components) {
      if (!row || typeof row !== "object" || !("components" in row)) {
        continue;
      }
      const rowComponents = (row as { components?: unknown }).components;
      if (!Array.isArray(rowComponents)) {
        continue;
      }
      for (const component of rowComponents) {
        if (!component || typeof component !== "object" || !("custom_id" in component)) {
          continue;
        }
        const field = component as ModalFieldData;
        this.fields.push(field);
        this.fieldsMap.set(field.custom_id, field);
      }
    }
  }

  /**
   * All extracted modal field data in order of appearance.
   * Prefer the typed `get*()` accessors for individual field access.
   * @returns {ModalFieldData[]} All extracted modal field data.
   */
  get data(): ModalFieldData[] {
    return this.fields;
  }

  /**
   * Returns whether a field with the given `custom_id` exists in the modal.
   *
   * @param {string} customId - The component's `custom_id`.
   * @returns {boolean} `true` if the field exists, otherwise `false`.
   */
  fieldExists(customId: string): boolean {
    return this.fieldsMap.has(customId);
  }

  /**
   * Retrieves raw field data for any component type.
   *
   * @param {string} customId - The component's `custom_id`.
   * @returns {ModalFieldData} The raw `ModalFieldData` for the component.
   * @throws {TypeError} When no component with the given `custom_id` exists.
   */
  getComponent(customId: string): ModalFieldData {
    const component = this.fieldsMap.get(customId);
    if (!component) {
      throw new TypeError("Modal component not found", { cause: { customId } });
    }
    return component;
  }

  /**
   * Retrieves the submitted text value of a text-input component.
   *
   * @param {string} customId - The text input's `custom_id`.
   * @param {boolean} required - When `true`, throws if no field with this id exists.
   * @returns {string | null} The string value, or `null` if absent and optional.
   * @throws {TypeError} When `required` is `true` and the field does not exist.
   */
  getString(customId: string, required = false): string | null {
    const component = this.fieldsMap.get(customId);
    if (!component) {
      if (required) {
        throw new TypeError("Modal text input not found", { cause: { customId } });
      }
      return null;
    }
    return typeof component.value === "string" ? component.value : null;
  }

  /**
   * Retrieves the selected values of a select-menu component.
   *
   * @param {string} customId - The select menu's `custom_id`.
   * @param {boolean} required - When `true`, throws if no field with this id exists.
   * @returns {readonly string[] | null} A readonly array of selected value strings, or `null` if absent and optional.
   * @throws {TypeError} When `required` is `true` and the field does not exist.
   */
  getSelectedValues(customId: string, required = false): readonly string[] | null {
    const component = this.fieldsMap.get(customId);
    if (!component) {
      if (required) {
        throw new TypeError("Modal select input not found", { cause: { customId } });
      }
      return null;
    }
    return component.values ?? null;
  }
}
