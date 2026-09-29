import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { extractApiError } from "@/lib/api";
import {
  useAdminCompanies,
  useAllRecruiters,
  useAssignRecruiterCompany,
  useCreateCompany,
  useUpdateCompany,
} from "./hooks";
import {
  AdminCompany,
  AdminRecruiterItem,
  CreateCompanyPayload,
  UpdateCompanyPayload,
} from "./types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}> = ({ active, onClick, icon: Icon, label, count }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
      active
        ? "bg-secondary text-amber-400 font-semibold shadow-sm"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
    }`}
  >
    <Icon className="h-4 w-4" />
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
        {count}
      </Badge>
    )}
  </button>
);

// Company Form Modal
const CompanyFormModal: React.FC<{
  company?: AdminCompany | null;
  onClose: () => void;
  onSave: (payload: CreateCompanyPayload | UpdateCompanyPayload) => Promise<void>;
  isSubmitting: boolean;
}> = ({ company, onClose, onSave, isSubmitting }) => {
  const [name, setName] = useState(company?.name ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [logoUrl, setLogoUrl] = useState(company?.logo_url ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }
    const payload: CreateCompanyPayload = {
      name: name.trim(),
      website: website.trim() || null,
      logo_url: logoUrl.trim() || null,
    };
    try {
      await onSave(payload);
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      setError(apiErr.message || "An unexpected error occurred.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {company ? "Edit Company" : "Create Company"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Company Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              disabled={isSubmitting}
              className="bg-secondary/30 border-border/60"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Website URL
            </label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={isSubmitting}
              className="bg-secondary/30 border-border/60"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Logo URL
            </label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://cdn.example.com/logo.png"
              disabled={isSubmitting}
              className="bg-secondary/30 border-border/60"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : company ? (
                "Save Changes"
              ) : (
                "Create Company"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Assign Company Modal
const AssignCompanyModal: React.FC<{
  recruiter: AdminRecruiterItem;
  companies: AdminCompany[];
  onClose: () => void;
  onAssign: (companyId: string) => Promise<void>;
  isSubmitting: boolean;
}> = ({ recruiter, companies, onClose, onAssign, isSubmitting }) => {
  const [selected, setSelected] = useState(recruiter.company?.id ?? "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Please select a company.");
      return;
    }
    try {
      await onAssign(selected);
    } catch (err: unknown) {
      const apiErr = extractApiError(err);
      setError(apiErr.message || "Failed to assign company.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Assign Company</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {recruiter.first_name} {recruiter.last_name} &bull; {recruiter.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/30 border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No companies match your search.
              </p>
            )}
            {filtered.map((company) => (
              <label
                key={company.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selected === company.id
                    ? "border-amber-500/60 bg-amber-500/10 text-foreground"
                    : "border-border/40 hover:border-border/80 hover:bg-secondary/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="company"
                  value={company.id}
                  checked={selected === company.id}
                  onChange={() => setSelected(company.id)}
                  className="accent-amber-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{company.name}</div>
                  {company.website && (
                    <div className="text-xs text-muted-foreground truncate">
                      {company.website}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {company.recruiter_count} recruiter{company.recruiter_count !== 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selected}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning...</>
              ) : (
                "Assign Company"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = "companies" | "recruiters";

export const AdminCompaniesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("companies");
  const [companySearch, setCompanySearch] = useState("");
  const [recruiterSearch, setRecruiterSearch] = useState("");
  const [companyPage, setCompanyPage] = useState(1);
  const [recruiterPage, setRecruiterPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null);
  const [assigningRecruiter, setAssigningRecruiter] = useState<AdminRecruiterItem | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Data
  const {
    data: companiesData,
    isLoading: companiesLoading,
    isError: companiesError,
    error: companiesErr,
    isFetching: companiesFetching,
    refetch: refetchCompanies,
  } = useAdminCompanies({ page: companyPage, limit: 20, search: companySearch || undefined });

  const {
    data: recruitersData,
    isLoading: recruitersLoading,
    isError: recruitersError,
    error: recruitersErr,
    isFetching: recruitersFetching,
    refetch: refetchRecruiters,
  } = useAllRecruiters({ page: recruiterPage, limit: 20, search: recruiterSearch || undefined });

  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();
  const assignMutation = useAssignRecruiterCompany();

  const companies = companiesData?.data ?? [];
  const companyMeta = companiesData?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 };
  const recruiters = recruitersData?.data ?? [];
  const recruiterMeta = recruitersData?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 };

  const handleCreateSave = async (payload: CreateCompanyPayload | UpdateCompanyPayload) => {
    const result = await createMutation.mutateAsync(payload as CreateCompanyPayload);
    setShowCreateModal(false);
    setSuccessBanner(`Company "${result.name}" created successfully.`);
    toast({ title: "Company Created", description: `"${result.name}" is now available for recruiter association.`, variant: "success" });
  };

  const handleEditSave = async (payload: UpdateCompanyPayload) => {
    if (!editingCompany) return;
    const result = await updateMutation.mutateAsync({ id: editingCompany.id, payload });
    setEditingCompany(null);
    setSuccessBanner(`Company "${result.name}" updated successfully.`);
    toast({ title: "Company Updated", description: `"${result.name}" has been updated.`, variant: "success" });
  };

  const handleAssign = async (companyId: string) => {
    if (!assigningRecruiter) return;
    const result = await assignMutation.mutateAsync({
      recruiterId: assigningRecruiter.id,
      payload: { company_id: companyId },
    });
    setAssigningRecruiter(null);
    setSuccessBanner(result.message);
    toast({ title: "Company Assigned", description: result.message, variant: "success" });
  };

  return (
    <div className="space-y-6">
      {/* Moderation Hub Navigation Pill Tabs (cross-feature) */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-4">
        <Link
          to="/admin/moderation"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <CheckSquare className="h-4 w-4" />
          <span>Job Postings</span>
        </Link>
        <Link
          to="/admin/recruiters"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <UserCheck className="h-4 w-4" />
          <span>Recruiter Approvals</span>
        </Link>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-secondary text-amber-400 shadow-sm">
          <Building2 className="h-4 w-4" />
          <span>Companies</span>
        </div>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Company Management
            </h1>
            <Badge variant="warning" className="gap-1 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Only</span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Create organizations and associate approved recruiters with their companies.
          </p>
        </div>

        {activeTab === "companies" && (
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white gap-2 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Company
          </Button>
        )}
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400/70 hover:text-emerald-400 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Inner Tab Bar */}
      <div className="flex items-center gap-1 bg-secondary/30 rounded-xl p-1 w-fit">
        <TabButton
          active={activeTab === "companies"}
          onClick={() => setActiveTab("companies")}
          icon={Building2}
          label="Organizations"
          count={companyMeta.total}
        />
        <TabButton
          active={activeTab === "recruiters"}
          onClick={() => setActiveTab("recruiters")}
          icon={Users}
          label="Recruiter Association"
          count={recruiterMeta.total}
        />
      </div>

      {/* ---- Companies Tab ---- */}
      {activeTab === "companies" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={companySearch}
              onChange={(e) => { setCompanySearch(e.target.value); setCompanyPage(1); }}
              placeholder="Search companies..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/30 border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {companiesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
              ))}
            </div>
          ) : companiesError ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/60" />
              <p className="text-muted-foreground text-sm">
                {extractApiError(companiesErr).message || "Failed to load companies."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchCompanies()} disabled={companiesFetching}>
                {companiesFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Retry
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
                <Building2 className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-foreground font-medium">No companies yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Create an organization to start associating recruiters.
                </p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white gap-2">
                <Plus className="h-4 w-4" />
                Create First Company
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => (
                <div
                  key={company.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-card border border-border/40 rounded-xl hover:border-border/80 transition-all"
                >
                  {/* Logo / icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/60 border border-border/40 overflow-hidden">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt={company.name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building2 className="h-6 w-6 text-muted-foreground/60" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">{company.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {company.recruiter_count} recruiter{company.recruiter_count !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {company.website && (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors mt-0.5"
                      >
                        <Globe className="h-3 w-3" />
                        <span className="truncate">{company.website}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCompany(company)}
                    className="shrink-0 gap-1.5 text-xs"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              ))}

              {/* Pagination */}
              {companyMeta.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
                  <div className="text-xs text-muted-foreground">
                    Page <span className="font-semibold">{companyMeta.page}</span> of{" "}
                    <span className="font-semibold">{companyMeta.totalPages}</span> ({companyMeta.total} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCompanyPage(p => p - 1)} disabled={companyMeta.page <= 1 || companiesFetching} className="h-8 gap-1 text-xs">
                      <ChevronLeft className="h-4 w-4" />Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCompanyPage(p => p + 1)} disabled={companyMeta.page >= companyMeta.totalPages || companiesFetching} className="h-8 gap-1 text-xs">
                      Next<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Recruiter Association Tab ---- */}
      {activeTab === "recruiters" && (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Only recruiters associated with a valid company can post jobs.
              Use the <strong>Assign Company</strong> button to link a recruiter to their organization.
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={recruiterSearch}
              onChange={(e) => { setRecruiterSearch(e.target.value); setRecruiterPage(1); }}
              placeholder="Search recruiters..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/30 border border-border/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {recruitersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
              ))}
            </div>
          ) : recruitersError ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/60" />
              <p className="text-muted-foreground text-sm">
                {extractApiError(recruitersErr).message || "Failed to load recruiters."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchRecruiters()} disabled={recruitersFetching}>
                Retry
              </Button>
            </div>
          ) : recruiters.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
                <Users className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-sm">No recruiters found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recruiters.map((recruiter) => {
                const hasRealCompany =
                  recruiter.company && recruiter.company.name.trim() !== "" && recruiter.company.name !== "Unassigned Company";
                return (
                  <div
                    key={recruiter.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-card border border-border/40 rounded-xl hover:border-border/80 transition-all"
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 border border-border/40 text-sm font-semibold text-foreground">
                      {recruiter.first_name.charAt(0).toUpperCase()}{recruiter.last_name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {recruiter.first_name} {recruiter.last_name}
                        </span>
                        <Badge
                          variant={recruiter.is_approved ? "success" : "warning"}
                          className="text-[10px]"
                        >
                          {recruiter.is_approved ? "Approved" : "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{recruiter.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                        {hasRealCompany ? (
                          <span className="text-xs text-emerald-400 font-medium">{recruiter.company!.name}</span>
                        ) : (
                          <span className="text-xs text-amber-400/70 italic">Unassigned — cannot post jobs</span>
                        )}
                      </div>
                    </div>

                    {/* Assign button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssigningRecruiter(recruiter)}
                      className="shrink-0 gap-1.5 text-xs border-amber-500/30 hover:border-amber-500 hover:text-amber-400"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {hasRealCompany ? "Reassign" : "Assign Company"}
                    </Button>
                  </div>
                );
              })}

              {/* Pagination */}
              {recruiterMeta.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
                  <div className="text-xs text-muted-foreground">
                    Page <span className="font-semibold">{recruiterMeta.page}</span> of{" "}
                    <span className="font-semibold">{recruiterMeta.totalPages}</span> ({recruiterMeta.total} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRecruiterPage(p => p - 1)} disabled={recruiterMeta.page <= 1 || recruitersFetching} className="h-8 gap-1 text-xs">
                      <ChevronLeft className="h-4 w-4" />Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setRecruiterPage(p => p + 1)} disabled={recruiterMeta.page >= recruiterMeta.totalPages || recruitersFetching} className="h-8 gap-1 text-xs">
                      Next<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CompanyFormModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateSave}
          isSubmitting={createMutation.isPending}
        />
      )}
      {editingCompany && (
        <CompanyFormModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSave={handleEditSave}
          isSubmitting={updateMutation.isPending}
        />
      )}
      {assigningRecruiter && (
        <AssignCompanyModal
          recruiter={assigningRecruiter}
          companies={companies}
          onClose={() => setAssigningRecruiter(null)}
          onAssign={handleAssign}
          isSubmitting={assignMutation.isPending}
        />
      )}
    </div>
  );
};
