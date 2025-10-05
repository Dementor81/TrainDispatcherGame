/**
 * Constants used in the scenario editor
 */


/**
 * Fixed color mapping for common categories.
 */
export const CATEGORY_COLOR_MAP: Record<string, number> = {   
   ice: 0xef4444,      // red
   ic: 0xFF8F8F,       // purple
   re: 0x3b82f6,       // blue
   rb: 0xF05CFF,       // blue
   s: 0x22c55e,        // green
   freight: 0xf59e0b,  // amber
};

/**
 * Returns a stable color for a given train category. If category is empty,
 * falls back to type-based defaults.
 */
export function getCategoryColor(category?: string, type?: 'Passenger' | 'Freight'): number {
   if (type === 'Freight') return CATEGORY_COLOR_MAP.freight;
   const normalized = (category || '').trim().toLowerCase();
   // Prefer fixed mappings for well-known categories (prefix match)
   if (normalized.length > 0) {
      for (const key in CATEGORY_COLOR_MAP) {
         if (normalized === key || normalized.startsWith(key)) {
            return CATEGORY_COLOR_MAP[key];
         }
      }
   }
   // Type-based fallback only (no hash-based fallback)
   
   return 0x3b82f6; // default Passenger blue
}

