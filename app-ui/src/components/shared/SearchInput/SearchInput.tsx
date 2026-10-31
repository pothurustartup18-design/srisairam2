import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import './SearchInput.css';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search…',
  debounceMs = 0,
}) => {
  const [draft, setDraft] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    if (debounceMs > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onChange(next), debounceMs);
    } else {
      onChange(next);
    }
  };

  return (
    <div className="shared-search-input">
      <Search size={16} className="shared-search-icon" />
      <input
        type="text"
        value={draft}
        onChange={handleChange}
        placeholder={placeholder}
      />
    </div>
  );
};

export default SearchInput;
