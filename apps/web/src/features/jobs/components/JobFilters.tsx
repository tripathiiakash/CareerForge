import React, { useEffect, useState } from 'react';
import { Search, X, Filter, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  totalResults,
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

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim().length > 0) ||
    (filters.skills && filters.skills.trim().length > 0) ||
    filters.employment_type
  );

  return (
    <div
      role="search"
      aria-label="Filter Job Postings"
      className="p-5 rounded-2xl bg-card border border-border/60 shadow-sm space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        {/* Search Input */}
        <div className="md:col-span-6 space-y-1.5">
          <label
            htmlFor="job-search-input"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Search Role or Keyword
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="job-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="e.g. Frontend Engineer, Full Stack, Distributed..."
              className="w-full pl-9 pr-9 h-10 rounded-lg border border-input bg-background/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear search text"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Skills Filter Input */}
        <div className="md:col-span-6 space-y-1.5">
          <label
            htmlFor="job-skills-input"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Filter by Skills (comma-separated)
          </label>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="job-skills-input"
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="e.g. React, TypeScript, Node.js, SQL..."
              className="w-full pl-9 pr-9 h-10 rounded-lg border border-input bg-background/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
            {skillsInput.length > 0 && (
              <button
                type="button"
                onClick={() => setSkillsInput('')}
                aria-label="Clear skills filter"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Skills & Employment Type Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/40">
        {/* Employment Type Pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1 hidden sm:inline">
            Type:
          </span>
          <Button
            type="button"
            size="sm"
            variant={!filters.employment_type ? 'default' : 'outline'}
            onClick={() => handleEmploymentTypeChange('')}
            className="h-8 text-xs px-3"
          >
            All Roles
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              filters.employment_type === 'FULL_TIME' ? 'default' : 'outline'
            }
            onClick={() => handleEmploymentTypeChange('FULL_TIME')}
            className="h-8 text-xs px-3"
          >
            Full-Time
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              filters.employment_type === 'INTERNSHIP' ? 'default' : 'outline'
            }
            onClick={() => handleEmploymentTypeChange('INTERNSHIP')}
            className="h-8 text-xs px-3"
          >
            Internship
          </Button>
        </div>

        {/* Active Filters Clear Button */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </Button>
        )}
      </div>

      {/* Suggested Skills Chips */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-[11px] font-medium text-muted-foreground mr-1 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-primary" />
          <span>Quick Filter:</span>
        </span>
        {COMMON_TECH_SKILLS.map((skill) => {
          const isSelected = (filters.skills || '')
            .toLowerCase()
            .includes(skill.toLowerCase());
          return (
            <button
              key={skill}
              type="button"
              onClick={() => handleToggleQuickSkill(skill)}
              className={`text-xs px-2.5 py-0.5 rounded-full border transition-all ${
                isSelected
                  ? 'bg-primary/20 border-primary/40 text-primary font-medium shadow-sm'
                  : 'bg-secondary/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {skill}
            </button>
          );
        })}
      </div>
    </div>
  );
};
