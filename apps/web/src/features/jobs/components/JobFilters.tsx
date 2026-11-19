import React, { useEffect, useState } from 'react';
import { Search, X, Filter, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmploymentType, JobFilterParams } from '../types';

interface JobFiltersProps {
  filters: JobFilterParams;
  onChange: (updated: Partial<JobFilterParams>) => void;
  onReset: () => void;
  totalResults?: number;
}

const COMMON_TECH_SKILLS = [
  'React',
  'Node.js',
  'TypeScript',
  'Python',
  'PostgreSQL',
  'Docker',
];

export const JobFilters: React.FC<JobFiltersProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [skillsInput, setSkillsInput] = useState(filters.skills || '');

  // Keep internal input states synchronized with external filter state
  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  useEffect(() => {
    setSkillsInput(filters.skills || '');
  }, [filters.skills]);

  // Debounce search input to avoid spamming the backend API
  useEffect(() => {
    const handler = setTimeout(() => {
      if ((filters.search || '') !== searchInput.trim()) {
        onChange({ search: searchInput.trim(), page: 1 });
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchInput]);

  // Debounce skills input
  useEffect(() => {
    const handler = setTimeout(() => {
      if ((filters.skills || '') !== skillsInput.trim()) {
        onChange({ skills: skillsInput.trim(), page: 1 });
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [skillsInput]);

  const handleEmploymentTypeChange = (type: EmploymentType | '') => {
    onChange({ employment_type: type, page: 1 });
  };

  const handleToggleQuickSkill = (skill: string) => {
    const currentSkills = (filters.skills || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const exists = currentSkills.some(
      (s) => s.toLowerCase() === skill.toLowerCase()
    );

    let nextSkills: string[];
    if (exists) {
      nextSkills = currentSkills.filter(
        (s) => s.toLowerCase() !== skill.toLowerCase()
      );
    } else {
      nextSkills = [...currentSkills, skill];
    }

    const nextSkillsString = nextSkills.join(', ');
    setSkillsInput(nextSkillsString);
    onChange({ skills: nextSkillsString, page: 1 });
  };

  const handleClearAll = () => {
    setSearchInput('');
    setSkillsInput('');
    onReset();
  };

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim().length > 0) ||
    (filters.skills && filters.skills.trim().length > 0) ||
    filters.employment_type
  );

  const activeSkillsList = (filters.skills || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return (
    <div
      role="search"
      aria-label="Filter Job Postings"
      className="p-3.5 sm:p-4 rounded-xl glass-card border border-border/60 shadow-sm space-y-3"
    >
      {/* Search & Skills Input Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Search Input */}
        <div className="relative">
          <label htmlFor="job-search-input" className="sr-only">
            Search Role or Keyword
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="job-search-input"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by role, keyword, or title..."
            className="w-full pl-9 pr-8 h-9 rounded-lg border border-input bg-background/60 text-sm text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
          />
          {searchInput.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search text"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Skills Filter Input */}
        <div className="relative">
          <label htmlFor="job-skills-input" className="sr-only">
            Filter by Skills
          </label>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="job-skills-input"
            type="text"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="Filter by skills (e.g. React, Python, SQL)..."
            className="w-full pl-9 pr-8 h-9 rounded-lg border border-input bg-background/60 text-sm text-foreground placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
          />
          {skillsInput.length > 0 && (
            <button
              type="button"
              onClick={() => setSkillsInput('')}
              aria-label="Clear skills filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls Row: Type Pills, Quick Chips, Clear Button */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
        {/* Left Side: Type Filters & Quick Skills */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Employment Type Segment */}
          <div className="inline-flex items-center rounded-lg bg-secondary/40 p-0.5 border border-border/50">
            <Button
              type="button"
              size="sm"
              variant={!filters.employment_type ? 'default' : 'ghost'}
              onClick={() => handleEmploymentTypeChange('')}
              className={`h-7 text-xs px-2.5 rounded-md ${
                !filters.employment_type
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-slate-300 hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              All Roles
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                filters.employment_type === 'FULL_TIME' ? 'default' : 'ghost'
              }
              onClick={() => handleEmploymentTypeChange('FULL_TIME')}
              className={`h-7 text-xs px-2.5 rounded-md ${
                filters.employment_type === 'FULL_TIME'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-slate-300 hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              Full-Time
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                filters.employment_type === 'INTERNSHIP' ? 'default' : 'ghost'
              }
              onClick={() => handleEmploymentTypeChange('INTERNSHIP')}
              className={`h-7 text-xs px-2.5 rounded-md ${
                filters.employment_type === 'INTERNSHIP'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-slate-300 hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              Internship
            </Button>
          </div>

          <div className="hidden sm:block h-4 w-px bg-border/60 mx-0.5" />

          {/* Quick Skill Filter Chips */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-medium text-slate-400 hidden lg:inline-flex items-center gap-1 mr-0.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Skills:</span>
            </span>
            {COMMON_TECH_SKILLS.map((skill) => {
              const isSelected = activeSkillsList.includes(skill.toLowerCase());
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => handleToggleQuickSkill(skill)}
                  className={`text-xs px-2.5 py-0.5 rounded-full border transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-xs shadow-primary/25'
                      : 'bg-secondary/40 border-border/60 text-slate-300 hover:text-foreground hover:bg-secondary hover:border-border'
                  }`}
                >
                  {skill}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Reset / Clear All Filters Button */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="h-7 text-xs text-slate-300 hover:text-destructive gap-1 px-2 self-start sm:self-auto shrink-0 transition-colors"
            aria-label="Reset Filters"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Filters</span>
          </Button>
        )}
      </div>
    </div>
  );
};
