// Utility functions adapted from azure-devops-mcp

export const apiVersion = "7.2-preview.1";
export const batchApiVersion = "5.0";
export const markdownCommentsApiVersion = "7.2-preview.4";
export const searchApiVersion = "7.1-preview.1";
export const advancedSecurityApiVersion = "7.2-preview.1";
export const testPlanApiVersion = "7.1-preview.1";

/**
 * Gets the string keys of an enum (filters out numeric reverse mappings)
 */
export function getEnumKeys<T extends object>(enumObj: T): string[] {
  return Object.keys(enumObj).filter((key) => isNaN(Number(key)));
}

/**
 * Creates a mapping from lowercase string keys to enum values
 */
export function createEnumMapping<T extends Record<string, string | number>>(enumObject: T): Record<string, T[keyof T]> {
  const mapping: Record<string, T[keyof T]> = {};
  for (const [key, value] of Object.entries(enumObject)) {
    if (typeof key === "string" && typeof value === "number") {
      mapping[key.toLowerCase()] = value as T[keyof T];
    }
  }
  return mapping;
}

/**
 * Maps a string value to its enum equivalent
 */
export function mapStringToEnum<T extends Record<string, string | number>>(value: string | undefined, enumObject: T, defaultValue?: T[keyof T]): T[keyof T] | undefined {
  if (!value) return defaultValue;
  const enumMapping = createEnumMapping(enumObject);
  return enumMapping[value.toLowerCase()] ?? defaultValue;
}

/**
 * Maps an array of strings to an array of enum values, filtering out invalid values.
 */
export function mapStringArrayToEnum<T extends Record<string, string | number>>(values: string[] | undefined, enumObject: T): T[keyof T][] {
  if (!values) return [];
  return values.map((value) => mapStringToEnum(value, enumObject)).filter((v): v is T[keyof T] => v !== undefined);
}

/**
 * Safely converts a string enum key to its corresponding enum value.
 */
export function safeEnumConvert<T extends Record<string, string | number>>(enumObject: T, key: string | undefined): T[keyof T] | undefined {
  if (!key) return undefined;

  const validKeys = getEnumKeys(enumObject);
  if (!validKeys.includes(key)) {
    return undefined;
  }

  return enumObject[key as keyof T];
}

/**
 * Encodes a value with HTML entities if format is Html, otherwise returns as-is
 */
export function encodeFormattedValue(value: string, format?: string): string {
  if (!value || format !== "Markdown") return value;
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * User agent string for API requests
 */
export function getUserAgent(): string {
  return "mcp-azure-devops/1.0.0";
}

/**
 * Converts a readable stream to string
 */
export function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}
