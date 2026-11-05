import React from 'react';

/** Small red superscript asterisk marking a mandatory form field. Put it inside the <label>. */
export const RequiredMark: React.FC = () => (
  <sup className="text-red-500 font-bold ml-0.5 text-[11px] leading-none" title="Required" aria-label="required">*</sup>
);
