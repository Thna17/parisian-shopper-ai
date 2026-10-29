import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface ProductSearchBarProps {
  readonly initialValue?: string;
  readonly onSearch: (value: string) => void;
  readonly placeholder?: string;
  readonly debounceMs?: number;
}

export const ProductSearchBar: React.FC<ProductSearchBarProps> = ({
  initialValue = '',
  onSearch,
  placeholder = 'Search by name, brand, or SKU...',
  debounceMs = 350,
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value.trim());
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, debounceMs, onSearch]);

  const handleClear = () => {
    setValue('');
    onSearch('');
  };

  return (
    <div className="relative flex-1 min-w-[240px]">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-app-muted">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="search"
        data-testid="product-search-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2 rounded-lg bg-app-surface border border-app-border text-sm text-app-primary placeholder:text-app-muted/70 focus:outline-none focus:ring-2 focus:ring-[#B59761]/40 focus:border-[#B59761] transition-all"
        aria-label="Search catalog"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-app-muted hover:text-app-primary"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
