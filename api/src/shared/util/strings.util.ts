// Capitalizes only the first character of a string and makes the rest lower case
export const capitalizeString = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().trim();