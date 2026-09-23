import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

const client = axios.create({
  baseURL: (process.env.REACT_APP_API_URL ?? 'http://localhost:3001') + '/api',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string }>) => {
    const status = err.response?.status;
    const message = err.response?.data?.error ?? err.message ?? 'An unexpected error occurred';
    const method = err.config?.method?.toLowerCase();
    const isMutation = method && ['post', 'put', 'patch', 'delete'].includes(method);
    // Only show toasts for user-triggered write operations, not background reads
    if (status === 403) {
      toast.error('You do not have permission to do that.');
    } else if (status === 429) {
      toast.error('Too many requests — please wait a moment and try again.');
    } else if (status && status >= 500 && isMutation) {
      toast.error(`Server error: ${message}`);
    }
    return Promise.reject(new ApiError(message, status));
  }
);

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ListResponse<T> {
  data: T[];
}

export interface ItemResponse<T> {
  data: T;
}

// ---------------------------------------------------------------------------
// Planning Cycles
// ---------------------------------------------------------------------------

export interface PlanningCycle {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'under_review' | 'approved' | 'closed';
  is_active: boolean;
  created_at: string;
}

export interface CreatePlanningCycleBody {
  name: string;
  start_date: string;
  end_date: string;
  copy_from_cycle_id?: number | null;
}

export interface UpdatePlanningCycleBody {
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: PlanningCycle['status'];
  is_active?: boolean;
}

export const planningCyclesApi = {
  list: () =>
    client.get<ListResponse<PlanningCycle>>('/planning-cycles').then(r => r.data.data),

  create: (body: CreatePlanningCycleBody) =>
    client.post<ItemResponse<PlanningCycle>>('/planning-cycles', body).then(r => r.data.data),

  update: (id: number, body: UpdatePlanningCycleBody) =>
    client.put<ItemResponse<PlanningCycle>>(`/planning-cycles/${id}`, body).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Cycle Approvers
// ---------------------------------------------------------------------------

export interface CycleApprover {
  id: number;
  planning_cycle_id: number;
  approver_name: string;
  approver_email: string | null;
  created_at: string;
}

export const cycleApproversApi = {
  list: (cycleId: number) =>
    client.get<ListResponse<CycleApprover>>(`/planning-cycles/${cycleId}/approvers`).then(r => r.data.data),

  add: (cycleId: number, approver_name: string, approver_email?: string) =>
    client.post<ItemResponse<CycleApprover>>(`/planning-cycles/${cycleId}/approvers`, {
      approver_name, approver_email: approver_email ?? null,
    }).then(r => r.data.data),

  remove: (cycleId: number, approverId: number) =>
    client.delete(`/planning-cycles/${cycleId}/approvers/${approverId}`),
};

// Roles permitted to edit in each cycle stage (mirrors backend cycleAccess.js)
export const STAGE_EDIT_ROLES: Record<string, string[]> = {
  draft:        ['PMO'],
  active:       ['PMO', 'Workforce Planning', 'Department Lead', 'Function Lead', 'Head of Department'],
  under_review: ['PMO', 'Workforce Planning', 'Department Lead', 'Function Lead', 'Head of Department', 'Head of Commercial'],
  approved:     [],
  closed:       [],
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Person {
  id: number;
  name: string;
  contracted_fte: number;
  is_active: boolean;
  workday_jr_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contract_type_code: string | null;
  contract_type_description: string | null;
  contract_category: string | null;
  colour_hex: string | null;
  level_name: string | null;
  level_code: string | null;
  level_id: number | null;
  discipline_name: string | null;
  discipline_id: number | null;
  tbh_id: string | null;
  tbh_code_id: number | null;
  contract_type_id: number | null;
  region_names: string | null;
  country_names: string | null;
}

export interface PersonDetail extends Person {
  regions: { region_id: number; name: string; code: string }[];
  countries: { country_id: number; name: string; code: string }[];
}

export interface PeopleQuery {
  discipline_id?: number;
  contract_type_id?: number;
  contract_category?: string;
  region_id?: number;
  is_active?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export interface CreatePersonBody {
  name: string;
  contract_type_id?: number | null;
  level_id?: number | null;
  discipline_id?: number | null;
  contracted_fte?: number;
  tbh_code_id?: number | null;
  workday_jr_id?: string | null;
  notes?: string | null;
  region_ids?: number[];
  country_ids?: number[];
}

export type UpdatePersonBody = Partial<CreatePersonBody> & { is_active?: boolean };

export const peopleApi = {
  list: (params?: PeopleQuery) =>
    client.get<ListResponse<Person>>('/people', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<PersonDetail>>(`/people/${id}`).then((r) => r.data.data),

  create: (body: CreatePersonBody) =>
    client.post<ItemResponse<Person>>('/people', body).then((r) => r.data.data),

  update: (id: number, body: UpdatePersonBody) =>
    client.put<ItemResponse<Person>>(`/people/${id}`, body).then((r) => r.data.data),

  deactivate: (id: number) =>
    client.delete(`/people/${id}`),

  deletePermanent: (id: number) =>
    client.delete(`/people/${id}/permanent`),

  bulkDeletePermanent: (ids: number[]) =>
    client.post<{ data: { deleted: number } }>('/people/bulk-delete', { ids }).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Headcount (placeholder workflow: R FTE → A FTE → FTE/SNR, R CON → A CON → CON)
// ---------------------------------------------------------------------------

export interface CreateHeadcountBody {
  name: string;
  contract_type_code: 'R FTE' | 'R CON';
  level_id?: number | null;
  discipline_id?: number | null;
  contracted_fte?: number;
  country_id?: number | null;
  region_id?: number | null;
  notes?: string | null;
}

export const headcountApi = {
  list: () =>
    client.get<ListResponse<Person>>('/headcount').then(r => r.data.data),

  create: (body: CreateHeadcountBody) =>
    client.post<ItemResponse<Person>>('/headcount', body).then(r => r.data.data),

  approve: (id: number) =>
    client.put<ItemResponse<Person>>(`/headcount/${id}/approve`).then(r => r.data.data),

  assignTbh: (id: number, tbh_code_id: number | null) =>
    client.put<ItemResponse<Person>>(`/headcount/${id}/tbh`, { tbh_code_id }).then(r => r.data.data),

  convert: (id: number, body: { name: string; new_contract_type_code: string; notes?: string | null; workday_jr_id?: string | null }) =>
    client.put<ItemResponse<Person>>(`/headcount/${id}/convert`, body).then(r => r.data.data),

  delete: (id: number) =>
    client.delete(`/headcount/${id}`),
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  id: number;
  name: string;
  type: string;
  status: string;
  weight: number;
  region_id: number | null;
  country_id: number | null;
  metro: string | null;
  phase_code: string | null;
  year: number | null;
  planning_cycle_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  region_name: string | null;
  country_name: string | null;
  is_emerging_market: boolean | null;
}

export interface ProjectsQuery {
  region_id?: number;
  year?: number;
  status?: string;
  type?: string;
  is_active?: 'true' | 'false' | 'all';
  planning_cycle_id?: number;
  limit?: number;
  offset?: number;
}

export interface CreateProjectBody {
  name: string;
  type: string;
  status: string;
  weight?: number;
  region_id?: number | null;
  country_id?: number | null;
  metro?: string | null;
  phase_code?: string | null;
  year?: number | null;
  planning_cycle_id?: number | null;
}

export type UpdateProjectBody = Partial<CreateProjectBody> & { is_active?: boolean };

export const projectsApi = {
  list: (params?: ProjectsQuery) =>
    client.get<ListResponse<Project>>('/projects', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<Project>>(`/projects/${id}`).then((r) => r.data.data),

  create: (body: CreateProjectBody) =>
    client.post<ItemResponse<Project>>('/projects', body).then((r) => r.data.data),

  update: (id: number, body: UpdateProjectBody) =>
    client.put<ItemResponse<Project>>(`/projects/${id}`, body).then((r) => r.data.data),

  deactivate: (id: number) =>
    client.delete(`/projects/${id}`),
};

// ---------------------------------------------------------------------------
// Project comments
// ---------------------------------------------------------------------------

export interface ProjectComment {
  id: number;
  project_id: number;
  user_name: string;
  user_role: string | null;
  body: string;
  created_at: string;
}

export const projectCommentsApi = {
  list: (projectId: number) =>
    client.get<ListResponse<ProjectComment>>(`/projects/${projectId}/comments`).then(r => r.data.data),
  create: (projectId: number, body: string) =>
    client.post<ItemResponse<ProjectComment>>(`/projects/${projectId}/comments`, { body }).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Country Allocations
// ---------------------------------------------------------------------------

export interface CountryAllocation {
  id: number;
  person_id: number;
  country_id: number;
  planning_cycle_id: number | null;
  fte_value: number;
  country_name: string;
  person_name: string;
  created_at: string;
  updated_at: string;
}

export const countryAllocationsApi = {
  list: (params: { planning_cycle_id?: number | null; region_id?: number | null; person_id?: number }) =>
    client.get<ListResponse<CountryAllocation>>('/country-allocations', { params }).then(r => r.data.data),
  save: (personId: number, planning_cycle_id: number | null, allocations: { country_id: number; fte_value: number }[]) =>
    client.put<ListResponse<CountryAllocation>>(`/country-allocations/${personId}`, { planning_cycle_id, allocations }).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Person Comments
// ---------------------------------------------------------------------------

export interface PersonComment {
  id: number;
  person_id: number;
  user_name: string;
  user_role: string | null;
  body: string;
  created_at: string;
}

export const personCommentsApi = {
  list: (personId: number) =>
    client.get<ListResponse<PersonComment>>('/person-comments', { params: { person_id: personId } }).then(r => r.data.data),
  create: (personId: number, body: string) =>
    client.post<ItemResponse<PersonComment>>('/person-comments', { person_id: personId, body }).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

export interface Allocation {
  id: number;
  person_id: number;
  project_id: number;
  month: string;
  fte_value: number;
  is_billable: boolean;
  flagged_for_review: boolean;
  flag_reason: string | null;
  updated_at: string;
  person_name: string;
  project_name: string;
  project_type: string;
  contract_type_code: string | null;
  colour_hex: string | null;
}

export interface AllocationsQuery {
  person_id?: number;
  project_id?: number;
  month_from?: string;
  month_to?: string;
  flagged?: boolean;
  planning_cycle_id?: number;
  limit?: number;
  offset?: number;
}

export interface UpsertAllocationBody {
  person_id: number;
  project_id: number;
  month: string;
  fte_value?: number;
  is_billable?: boolean;
}

export interface UpdateAllocationBody {
  fte_value?: number;
  is_billable?: boolean;
  flagged_for_review?: boolean;
  flag_reason?: string | null;
}

export const allocationsApi = {
  list: (params?: AllocationsQuery) =>
    client.get<ListResponse<Allocation>>('/allocations', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<Allocation>>(`/allocations/${id}`).then((r) => r.data.data),

  upsert: (body: UpsertAllocationBody) =>
    client.post<ItemResponse<Allocation>>('/allocations', body).then((r) => r.data.data),

  update: (id: number, body: UpdateAllocationBody) =>
    client.put<ItemResponse<Allocation>>(`/allocations/${id}`, body).then((r) => r.data.data),

  delete: (id: number) =>
    client.delete(`/allocations/${id}`),
};

// ---------------------------------------------------------------------------
// Hire Requests
// ---------------------------------------------------------------------------

export interface HireRequest {
  id: number;
  request_type: string;
  status: string;
  stage: number;
  justification: string | null;
  created_at: string;
  discipline_name: string | null;
  level_name: string | null;
  contract_type_code: string | null;
  region_name: string | null;
  country_name: string | null;
  project_name: string | null;
  submitted_by_name: string | null;
}

export interface HireRequestDetail extends HireRequest {
  discipline_id: number | null;
  level_id: number | null;
  contract_type_id: number | null;
  region_id: number | null;
  country_id: number | null;
  project_id: number | null;
  submitted_by: number;
  stage2_user_id: number | null;
  stage3_user_id: number | null;
  stage4_user_id: number | null;
  stage2_user_name: string | null;
  stage3_user_name: string | null;
  stage4_user_name: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

export interface HireRequestsQuery {
  status?: string;
  stage?: number;
  submitted_by?: number;
  region_id?: number;
  limit?: number;
  offset?: number;
}

export interface CreateHireRequestBody {
  request_type: string;
  discipline_id?: number | null;
  level_id?: number | null;
  contract_type_id?: number | null;
  region_id?: number | null;
  country_id?: number | null;
  project_id?: number | null;
  justification?: string | null;
}

export const hireRequestsApi = {
  list: (params?: HireRequestsQuery) =>
    client.get<ListResponse<HireRequest>>('/hire-requests', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<HireRequestDetail>>(`/hire-requests/${id}`).then((r) => r.data.data),

  create: (body: CreateHireRequestBody) =>
    client.post<ItemResponse<HireRequestDetail>>('/hire-requests', body).then((r) => r.data.data),

  approve: (id: number) =>
    client.post<ItemResponse<HireRequestDetail>>(`/hire-requests/${id}/approve`).then((r) => r.data.data),

  reject: (id: number, rejection_reason?: string) =>
    client.post<ItemResponse<HireRequestDetail>>(`/hire-requests/${id}/reject`, { rejection_reason }).then((r) => r.data.data),
};

// ---------------------------------------------------------------------------
// Change Requests
// ---------------------------------------------------------------------------

export interface ChangeRequest {
  id: number;
  change_type: string;
  status: string;
  auto_approved: boolean;
  justification: string | null;
  current_manager: string | null;
  new_manager: string | null;
  new_metro_location: string | null;
  approval_type: string | null;
  senior_approver: string | null;
  senior_approver_status: string | null;
  xscale_vs_retail: string | null;
  requestor_email: string | null;
  comments: string | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
  new_tbh_code_assigned: string | null;
  is_borrowed_or_repurposed: boolean | null;
  created_at: string;
  approved_at: string | null;
  tbh_id: string | null;
  new_region_name: string | null;
  new_country_name: string | null;
  new_level_name: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  approved_by_name: string | null;
}

export interface ChangeRequestsQuery {
  status?: string;
  change_type?: string;
  submitted_by?: number;
  limit?: number;
  offset?: number;
}

export interface CreateChangeRequestBody {
  tbh_code_id?: number | null;
  change_type: string;
  current_manager?: string | null;
  new_manager?: string | null;
  new_metro_location?: string | null;
  new_region_id?: number | null;
  new_country_id?: number | null;
  new_level_id?: number | null;
  is_borrowed_or_repurposed?: boolean | null;
  justification?: string | null;
  approval_type?: string | null;
  senior_approver?: string | null;
  xscale_vs_retail?: string | null;
  requestor_email?: string | null;
  comments?: string | null;
}

export interface ApproveChangeRequestBody {
  reviewer_notes?: string | null;
  new_tbh_code_assigned?: string | null;
  senior_approver_status?: string | null;
}

export const changeRequestsApi = {
  list: (params?: ChangeRequestsQuery) =>
    client.get<ListResponse<ChangeRequest>>('/change-requests', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<ChangeRequest>>(`/change-requests/${id}`).then((r) => r.data.data),

  create: (body: CreateChangeRequestBody) =>
    client.post<ItemResponse<ChangeRequest>>('/change-requests', body).then((r) => r.data.data),

  approve: (id: number, body?: ApproveChangeRequestBody) =>
    client.post<ItemResponse<ChangeRequest>>(`/change-requests/${id}/approve`, body ?? {}).then((r) => r.data.data),

  reject: (id: number, rejection_reason?: string, reviewer_notes?: string) =>
    client.post<ItemResponse<ChangeRequest>>(`/change-requests/${id}/reject`, { rejection_reason, reviewer_notes }).then((r) => r.data.data),
};

// ---------------------------------------------------------------------------
// Smartsheet — Change Requests (live read from Smartsheet + local plan status)
// ---------------------------------------------------------------------------

export interface SmartsheetRow {
  _rowId: string;
  _rowNumber: number;
  _planStatus: string;
  _planNotes: string | null;
  _updatedByName: string | null;
  _statusUpdatedAt: string | null;
  _tbhInPlan: boolean | null;
  _newTbhInPlan: boolean | null;
  _region: string | null;
  _discipline: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

export interface SmartsheetSheet {
  columns: string[];
  rows: SmartsheetRow[];
}

export const smartsheetApi = {
  changeRequests: () =>
    client.get<SmartsheetSheet>('/smartsheet/change-requests').then(r => r.data),

  setStatus: (rowId: string, plan_status: string, notes?: string | null) =>
    client.post(`/smartsheet/change-requests/${rowId}/status`, { plan_status, notes }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// TBH Codes (Recruitment)
// ---------------------------------------------------------------------------

export interface TbhCode {
  id: number;
  tbh_id: string;
  old_tbh: string | null;
  funding_year: number | null;
  hire_type: string | null;
  region_id: number | null;
  project_type: string | null;
  legal_entity: string | null;
  location_code: string | null;
  cost_centre: string | null;
  job_profile: string | null;
  replaced_emp_name: string | null;
  manager_name: string | null;
  target_hire_date: string | null;
  jr_id: string | null;
  req_status: string | null;
  ta_contact: string | null;
  candidate_name: string | null;
  estimated_hire_date: string | null;
  ta_status_comments: string | null;
  tbh_description: string | null;
  fp_and_a_notes: string | null;
  region_name: string | null;
}

export interface TbhCodesQuery {
  region_id?: number;
  funding_year?: number;
  req_status?: string;
  limit?: number;
  offset?: number;
}

export type CreateTbhCodeBody = Pick<TbhCode, 'tbh_id'> & Partial<Omit<TbhCode, 'id' | 'tbh_id' | 'region_name'>>;
export type UpdateTbhCodeBody = Partial<Omit<TbhCode, 'id' | 'tbh_id' | 'region_name'>>;

export const tbhCodesApi = {
  list: (params?: TbhCodesQuery) =>
    client.get<ListResponse<TbhCode>>('/tbh-codes', { params }).then((r) => r.data.data),

  get: (id: number) =>
    client.get<ItemResponse<TbhCode>>(`/tbh-codes/${id}`).then((r) => r.data.data),

  create: (body: CreateTbhCodeBody) =>
    client.post<ItemResponse<TbhCode>>('/tbh-codes', body).then((r) => r.data.data),

  update: (id: number, body: UpdateTbhCodeBody) =>
    client.put<ItemResponse<TbhCode>>(`/tbh-codes/${id}`, body).then((r) => r.data.data),

  delete: (id: number) =>
    client.delete(`/tbh-codes/${id}`),

  importExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post<{ inserted: number; updated: number; skipped: number; total: number }>(
      '/tbh-codes/import', formData
    ).then(r => r.data);
  },
};

// ---------------------------------------------------------------------------
// Reference data  (admin endpoints, read-only for all roles)
// ---------------------------------------------------------------------------

export interface Discipline { id: number; name: string; code: string | null }
export interface Level { id: number; level_name: string; short_code: string; level_number: number | null }
export interface ContractType { id: number; code: string; description: string; colour_hex: string | null; category: string | null }
export interface Region  { id: number; name: string; code: string; sort_order: number }
export interface Country { id: number; name: string; code: string; region_id: number; region_name: string }

export const refDataApi = {
  disciplines:   () => client.get<ListResponse<Discipline>>('/admin/disciplines').then((r) => r.data.data),
  levels:        () => client.get<ListResponse<Level>>('/admin/levels').then((r) => r.data.data),
  contractTypes: () => client.get<ListResponse<ContractType>>('/admin/contract-types').then((r) => r.data.data),
  regions:       () => client.get<ListResponse<Region>>('/admin/regions').then((r) => r.data.data),
  countries:     (region_id?: number) =>
    client.get<ListResponse<Country>>('/admin/countries', { params: region_id ? { region_id } : undefined })
      .then((r) => r.data.data),
};

// ---------------------------------------------------------------------------
// Gearing Constants
// ---------------------------------------------------------------------------

export interface GearingConstant {
  id: number;
  discipline_id: number;
  discipline_name: string;
  project_type: string;
  min_divisor: number;
  max_divisor: number;
  updated_at: string;
  updated_by_name?: string;
}

export const gearingApi = {
  list: () => client.get<ListResponse<GearingConstant>>('/gearing').then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const importsApi = {
  people:   (records: any[]) => client.post('/imports/people',   { records }).then(r => r.data.data),
  projects: (records: any[]) => client.post('/imports/projects', { records }).then(r => r.data.data),
  tbhCodes: (records: any[]) => client.post('/imports/tbh-codes', { records }).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  total_people: number;
  total_projects: number;
  total_allocations: number;
  pending_hire_requests: number;
  pending_change_requests: number;
  open_tbh_codes: number;
}

export interface CapacityItem {
  id: number;
  name: string;
  contracted_fte: number;
  allocated_fte: number;
  utilisation_ratio: number | null;
  discipline_name: string | null;
  contract_type_code: string | null;
  colour_hex: string | null;
}

export const dashboardApi = {
  summary: () =>
    client.get<{ data: DashboardSummary }>('/dashboard/summary').then((r) => r.data.data),

  capacity: (month: string) =>
    client.get<ListResponse<CapacityItem>>('/dashboard/capacity', { params: { month } })
      .then((r) => r.data.data),

  planningYears: () =>
    client.get<ListResponse<{ year: number; is_active: boolean }>>('/dashboard/planning-years')
      .then((r) => r.data.data),

  hubIq: (yearA: number, yearB: number) =>
    client.get<HubIqResponse>('/dashboard/hub-iq', { params: { yearA, yearB } })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// HUB IQ dashboard types
// ---------------------------------------------------------------------------

export interface HubIqProjectSummary {
  total: number; retail: number; xscale: number;
  total_weight: number; retail_weight: number; xscale_weight: number;
}
export interface HubIqHcGroup   { total: number; fte: number; con: number }
export interface HubIqExistHc   { total: number; perm: number; contingent: number }
export interface HubIqSummary   { projects: HubIqProjectSummary; exist_hc: HubIqExistHc; appr_hc: HubIqHcGroup; req_hc: HubIqHcGroup }

export interface HubIqPipelineRow {
  region_name: string; sort_order: number;
  retail: { Approved: number; Seeded: number; Proposed: number; weight: number; Approved_weight: number; Seeded_weight: number; Proposed_weight: number };
  xscale: { Approved: number; Seeded: number; Proposed: number; weight: number; Approved_weight: number; Seeded_weight: number; Proposed_weight: number };
  total_weight: number;
}

export interface HubIqHeadcountRow {
  region_name: string; sort_order: number;
  exist_vp_dir: number; exist_fte: number; exist_con: number;
  appr_fte: number; appr_con_fte: number; existing_heads: number;
  req_fte: number; req_con_fte: number; req_con: number; total_heads: number;
}

export interface HubIqGearingRegion {
  region_name: string; min: number; max: number;
  proposed: number; optimal: number; variance: number; variance_pct: number;
}
export interface HubIqGearingTotals {
  min: number; max: number;
  proposed: number; optimal: number; variance: number; variance_pct: number;
}
export interface HubIqGearingDisc {
  discipline: string;
  regions: HubIqGearingRegion[];
  totals: HubIqGearingTotals;
}

export interface HubIqRequest {
  discipline_name: string; region_name: string; country_name: string | null;
  level_code: string | null; contract_code: string;
  planning_year: number | null; person_name: string; contracted_fte: number;
}

export interface HubIqMeta { countries_count: number; metros_count: number }

export interface HubIqYearData {
  summary:          HubIqSummary;
  pipeline:         HubIqPipelineRow[];
  pipeline_country: HubIqPipelineRow[];
  headcount:        HubIqHeadcountRow[];
  gearing:   HubIqGearingDisc[];
  requests:  HubIqRequest[];
  meta:      HubIqMeta;
}

export interface HubIqTrendRow   { year: number; status: string; count: number }
export interface HubIqTbhStatus  { funding_year: number; req_status: string; count: number }

export interface HubIqResponse {
  available_years:    number[];
  yearA: number;
  yearB: number;
  region_names:       string[];
  all_region_names:   string[];
  region_code_map:    Record<string, string>;
  project_trend:      HubIqTrendRow[];
  tbh_status:         HubIqTbhStatus[];
  years: Record<number, HubIqYearData>;
}
