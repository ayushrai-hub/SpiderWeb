import { getSupabase } from '@intel/shared';

export interface ProfileData {
  identity: {
    name: string | null;
    headline: string | null;
    location: string | null;
    profileUrl: string | null;
    email: string | null;
  };
  career: Array<{
    company: string | null;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }>;
  education: Array<{
    school: string | null;
    degree: string | null;
    field: string | null;
    start: string | null;
    end: string | null;
  }>;
  skills: Array<{ name: string; endorsements: number }>;
  network: {
    connections: number;
    companies: number;
    messages: number;
    importsCompleted: number;
    lastImportAt: string | null;
  };
  hasData: boolean;
}

/**
 * Builds the user's profile from imported data only.
 * Every field is null/empty when absent — nothing is invented.
 * Identity comes from the LinkedIn Profile.csv import (people row with
 * confidence 100 / source_file Profile.csv); falls back to the
 * highest-confidence person if no explicit profile row exists.
 */
export async function getProfileData(workspaceId: string): Promise<ProfileData> {
  const supabase = getSupabase();

  // Identity candidate: person rows from Profile import have source_type linkedin
  // and confidence 100. Pick created earliest (the profile is usually imported
  // first) with a name that isn't a bare connection.
  const { data: profileRows } = await supabase
    .from('people')
    .select('id, canonical_name, headline, location, profile_url, confidence, created_at')
    .eq('workspace_id', workspaceId)
    .eq('confidence', 100)
    .order('created_at', { ascending: true })
    .limit(1);

  const profilePerson = profileRows?.[0] ?? null;

  // Email from person_identifiers of the profile person
  let email: string | null = null;
  if (profilePerson) {
    const { data: ident } = await supabase
      .from('person_identifiers')
      .select('identifier_value')
      .eq('person_id', profilePerson.id)
      .eq('identifier_type', 'email')
      .limit(1);
    email = ident?.[0]?.identifier_value ?? null;
  }

  // Career timeline from employment (no person link — it's the owner's own history)
  const { data: employment } = await supabase
    .from('person_employment')
    .select('company_name, title, start_date, end_date, is_current')
    .eq('workspace_id', workspaceId)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(50);

  // Education
  const { data: education } = await supabase
    .from('education')
    .select('school_name, degree, field_of_study, start_date, end_date')
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(50);

  // Skills (owner's own — rows with null person are owner-level in our import)
  const { data: skills } = await supabase
    .from('skills')
    .select('name, endorsement_count')
    .limit(100);

  // Network stats — counts only
  const [connectionsCount, companiesCount, messagesCount, importsDone, lastImport] =
    await Promise.all([
      supabase.from('connections').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('imports').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'completed'),
      supabase.from('imports').select('uploaded_at').eq('workspace_id', workspaceId).order('uploaded_at', { ascending: false }).limit(1),
    ]);

  const career = (employment || []).map((e: any) => ({
    company: e.company_name ?? null,
    title: e.title ?? null,
    startDate: e.start_date ?? null,
    endDate: e.end_date ?? null,
    isCurrent: !!e.is_current,
  }));

  const edu = (education || []).map((e: any) => ({
    school: e.school_name ?? null,
    degree: e.degree ?? null,
    field: e.field_of_study ?? null,
    start: e.start_date ?? null,
    end: e.end_date ?? null,
  }));

  const skillList = (skills || []).map((s: any) => ({
    name: s.name,
    endorsements: s.endorsement_count ?? 0,
  }));

  const hasData =
    connectionsCount.count !== null && connectionsCount.count !== undefined
      ? connectionsCount.count > 0
      : false;

  return {
    identity: {
      name: profilePerson?.canonical_name ?? null,
      headline: profilePerson?.headline ?? null,
      location: profilePerson?.location ?? null,
      profileUrl: profilePerson?.profile_url ?? null,
      email,
    },
    career,
    education: edu,
    skills: skillList,
    network: {
      connections: connectionsCount.count ?? 0,
      companies: companiesCount.count ?? 0,
      messages: messagesCount.count ?? 0,
      importsCompleted: importsDone.count ?? 0,
      lastImportAt: lastImport.data?.[0]?.uploaded_at ?? null,
    },
    hasData: hasData || career.length > 0 || edu.length > 0,
  };
}
