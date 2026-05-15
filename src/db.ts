import { get, set, del } from 'idb-keyval';

export type AssetType = 'image' | 'video';

export interface DBAsset {
  id: string;
  type: AssetType;
  x: number;
  y: number;
  width: number;
  height: number;
  sequence: number;
  name: string;
  file?: File | Blob;
  fileData?: string;
  rotation?: number;
}

export interface DBAgentMessage {
  role: 'user' | 'model';
  text: string;
  assets?: DBAsset[];
}

export interface DBProject {
  id: string;
  title: string;
  updatedAt: number;
  assets: DBAsset[];
  agentMessages?: DBAgentMessage[];
}

const METADATA_KEY = 'scenelink_projects_list';
const PROJECT_PREFIX = 'scenelink_project_data_';

export async function getProjects(): Promise<DBProject[]> {
  // Try to load the new metadata list first
  let list = await get<{id: string, title: string, updatedAt: number}[]>(METADATA_KEY);
  
  if (!list) {
    // Migration: Check for old structure
    const oldProjects = await get<DBProject[]>('scenelink_projects');
    if (oldProjects && oldProjects.length > 0) {
      console.log('Migrating old project structure...');
      for (const p of oldProjects) {
        await set(PROJECT_PREFIX + p.id, p);
      }
      list = oldProjects.map(p => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }));
      await set(METADATA_KEY, list);
      // We don't delete old data yet just in case, but we prefer new structure
    }
  }

  if (!list) return [];

  // Load actual project data for each (metadata only used for sorting/listing if needed, 
  // but here we need full project data for the current app logic)
  const projects = await Promise.all(list.map(m => get<DBProject>(PROJECT_PREFIX + m.id)));
  return projects.filter((p): p is DBProject => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(project: DBProject): Promise<void> {
  // 1. Save full project data
  await set(PROJECT_PREFIX + project.id, project);

  // 2. Update metadata list
  const list = await get<{id: string, title: string, updatedAt: number}[]>(METADATA_KEY) || [];
  const existingIdx = list.findIndex(m => m.id === project.id);
  
  const metadata = { id: project.id, title: project.title, updatedAt: project.updatedAt };
  
  if (existingIdx >= 0) {
    list[existingIdx] = metadata;
  } else {
    list.push(metadata);
  }
  
  // Sort list descending by updatedAt
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  
  await set(METADATA_KEY, list);
}

export async function deleteProject(id: string): Promise<void> {
  // 1. Delete project data
  await del(PROJECT_PREFIX + id);
  
  // 2. Update metadata list
  const list = await get<{id: string, title: string, updatedAt: number}[]>(METADATA_KEY) || [];
  const filtered = list.filter(m => m.id !== id);
  await set(METADATA_KEY, filtered);
}
