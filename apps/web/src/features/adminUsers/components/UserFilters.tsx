import React from 'react';
import { Search, Users, GraduationCap, Briefcase } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AdminUserFilterRole } from '../types';

export interface UserFiltersProps {
  selectedRole?: AdminUserFilterRole;
  search: string;
  onRoleChange: (role: AdminUserFilterRole | undefined) => void;
  onSearchChange: (search: string) => void;
}

export const UserFilters: React.FC<UserFiltersProps> = ({
  selectedRole,
  search,
  onRoleChange,
  onSearchChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      {/* Role Filter Tabs */}
      <div
        className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/40 border border-border/50 self-start sm:self-auto"
        role="tablist"
        aria-label="Filter users by role"
      >
        <Button
          type="button"
          variant={selectedRole === undefined ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onRoleChange(undefined)}
          className="gap-1.5 text-xs h-8 px-3 rounded-lg"
          role="tab"
          aria-selected={selectedRole === undefined}
        >
          <Users className="h-3.5 w-3.5" />
          <span>All Users</span>
        </Button>

        <Button
          type="button"
          variant={selectedRole === 'STUDENT' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onRoleChange('STUDENT')}
          className="gap-1.5 text-xs h-8 px-3 rounded-lg"
          role="tab"
          aria-selected={selectedRole === 'STUDENT'}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          <span>Students</span>
        </Button>

        <Button
          type="button"
          variant={selectedRole === 'RECRUITER' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onRoleChange('RECRUITER')}
          className="gap-1.5 text-xs h-8 px-3 rounded-lg"
          role="tab"
          aria-selected={selectedRole === 'RECRUITER'}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Recruiters</span>
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative w-full sm:w-72">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
          <Search className="h-4 w-4" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by email..."
          aria-label="Search users by email"
          className="flex h-9 w-full rounded-lg border border-input bg-background/50 pl-9 pr-3 py-1.5 text-sm text-foreground shadow-sm backdrop-blur-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
        />
      </div>
    </div>
  );
};
