// ─── API Base URL ─────────────────────────────────────────────────────────────

export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000/api`
    : 'http://localhost:5000/api');

export const formatClassName = (className: string, section?: string): string => {
  if (!className) return '';
  const formattedClass = isNaN(Number(className)) ? className : `Class ${className}`;
  if (!section || section === '-') {
    return formattedClass;
  }
  return `${formattedClass} - ${section}`;
};

export const formatRoomDisplay = (room: string): string => {
  if (!room) return '';
  const clean = room.replace(/^class\s+/i, '').trim();
  const parts = clean.split('-');
  const className = parts[0]?.trim() || '';
  const section = parts.slice(1).join('-').trim();
  return formatClassName(className, section);
};

export const classOrder = ['NURSERY', 'NUS', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const sortClasses = (classes: string[]): string[] => {
  return [...classes].sort((a, b) => {
    const idxA = classOrder.indexOf(a.toUpperCase());
    const idxB = classOrder.indexOf(b.toUpperCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
};

export const getSelectableClasses = (classesList: any[]): any[] => {
  const predefinedGrades = ['NURSERY', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const results: any[] = [];

  predefinedGrades.forEach(grade => {
    const dbEntries = classesList ? classesList.filter(c => c.className === grade) : [];
    if (dbEntries.length > 0) {
      results.push(...dbEntries);
    } else {
      results.push({
        _id: `${grade}--`,
        className: grade,
        section: '-'
      });
    }
  });

  return results;
};

