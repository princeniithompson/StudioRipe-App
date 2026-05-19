import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { get, set } from 'idb-keyval';

export type AssetType = 'image' | 'video';
export type StorageType = 'local' | 'cloud';

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
  storageType: StorageType;
  agentMessages?: DBAgentMessage[];
  userId?: string;
}

// LOCAL INDEXED DB OPERATIONS (Zero Telemetry)
// All projects are written here first regardless of storage type
export async function getProjects(): Promise<DBProject[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const projects = await get<DBProject[]>(`projects_${user.uid}`) || [];
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("Local DB Load Error:", error);
    return [];
  }
}

export async function saveProject(project: DBProject): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const cleanProject: DBProject = {
      ...project,
      userId: user.uid,
      updatedAt: Date.now(),
      assets: project.assets.map(a => {
        const { file, ...rest } = a;
        return rest as DBAsset;
      }),
    };
    
    // We persist everything locally, including fileData (base64) for instant loading
    // But we strip File objects because they don't persist well in IDB-keyval sometimes
    // or cause DataCloneErrors if not handled carefully. 
    // Actually IDB handles Blobs fine, but we'll stick to a clean object for the list.
    
    const projects = await get<DBProject[]>(`projects_${user.uid}`) || [];
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = cleanProject;
    } else {
      projects.push(cleanProject);
    }
    await set(`projects_${user.uid}`, projects);
  } catch(error) {
    console.error("Local DB Save Error:", error);
    throw error;
  }
}

// CLOUD FIRESTORE HYBRID OPERATIONS
/**
 * Ensures project shell exists and syncs metadata
 */
export async function syncProjectMetadata(project: DBProject): Promise<void> {
  const user = auth.currentUser;
  if (!user || project.storageType !== 'cloud') return;
  
  const cleanProject: any = {
    ...project,
    userId: user.uid,
    assets: project.assets.map((a: any) => {
      const { file, url, fileData, ...rest } = a;
      return rest;
    }),
  };

  if (project.agentMessages) {
    cleanProject.agentMessages = project.agentMessages.map((m: any) => {
      const msg: any = { role: m.role, text: m.text };
      if (m.assets) {
        msg.assets = m.assets.map((a: any) => {
          const { file, url, fileData, ...rest } = a;
          return rest;
        });
      }
      return msg;
    });
  }

  try {
    const sanitizedProject = removeUndefined(cleanProject);
    await withTimeout(
      setDoc(doc(db, 'projects', project.id), sanitizedProject, { merge: true }),
      15000,
      "Metadata sync timed out"
    );
  } catch(error) {
    console.error("Metadata Sync Error:", error);
    throw error;
  }
}

export async function setAllProjects(projects: DBProject[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await set(`projects_${user.uid}`, projects);
}

export async function deleteProject(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const projects = await get<DBProject[]>(`projects_${user.uid}`) || [];
    const newProjects = projects.filter(p => p.id !== id);
    await set(`projects_${user.uid}`, newProjects);
  } catch (error) {
    console.error("Local DB Delete Error:", error);
  }
}

// CLOUD FIRESTORE COMPANION OPERATIONS (Explicit Deployment)
export async function getCloudProjects(): Promise<DBProject[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    const projects: DBProject[] = [];
    snap.forEach(doc => {
      projects.push(doc.data() as DBProject);
    });
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'projects');
    return [];
  }
}

export async function getUploadedAssetIds(projectId: string): Promise<string[]> {
  try {
    const q = collection(db, 'projects', projectId, 'assets');
    const snap = await getDocs(q);
    const ids: string[] = [];
    snap.forEach(doc => ids.push(doc.id));
    return ids;
  } catch (error) {
    return [];
  }
}

export async function getAssetData(projectId: string, assetId: string): Promise<Partial<DBAsset> | null> {
  try {
    const d = await getDocs(query(collection(db, 'projects', projectId, 'assets'), where('id', '==', assetId)));
    if (d.empty) return null;
    return d.docs[0].data() as DBAsset;
  } catch (error) {
    return null;
  }
}

export async function getProjectAssets(projectId: string): Promise<DBAsset[]> {
  try {
    const q = collection(db, 'projects', projectId, 'assets');
    const snap = await getDocs(q);
    const assets: DBAsset[] = [];
    snap.forEach(doc => {
      assets.push(doc.data() as DBAsset);
    });
    return assets;
  } catch (error) {
    console.error("Cloud Assets Load Error:", error);
    return [];
  }
}

/**
 * Helper to wrap promises with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
  ]);
}

/**
 * Recursively remove undefined values from an object or array.
 */
function removeUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  const cleanObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      cleanObj[key] = removeUndefined(obj[key]);
    }
  });
  return cleanObj;
}

export async function deployProjectToCloud(project: DBProject): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  
  const cleanProject: any = {
    ...project,
    userId: user.uid,
    assets: project.assets.map((a: any) => {
      const { file, url, fileData, ...rest } = a;
      return rest;
    }),
  };

  if (project.agentMessages) {
    cleanProject.agentMessages = project.agentMessages.map((m: any) => {
      const msg: any = { role: m.role, text: m.text };
      if (m.assets) {
        msg.assets = m.assets.map((a: any) => {
          const { file, url, fileData, ...rest } = a;
          return rest;
        });
      }
      return msg;
    });
  } else {
    delete cleanProject.agentMessages;
  }

  const sanitizedProject = removeUndefined(cleanProject);
  
  try {
    // 30 second timeout for metadata
    await withTimeout(
      setDoc(doc(db, 'projects', project.id), sanitizedProject),
      30000,
      "Project metadata upload timed out. Check your connection."
    );
  } catch(error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${project.id}`);
    throw error;
  }
}

export async function deployAssetToCloud(projectId: string, asset: DBAsset): Promise<void> {
  const { file, url, ...rest } = asset as any;
  Object.keys(rest).forEach(key => rest[key] === undefined && delete rest[key]);
  
  // Strict size validation to prevent Firestore hangs
  if (rest.fileData && rest.fileData.length > 1300000) { // ~975KB limit
     throw new Error(`Asset "${asset.name}" is too large for cloud sync (Limit: 1MB).`);
  }

  try {
    // 60 second timeout per asset
    await withTimeout(
      setDoc(doc(db, 'projects', projectId, 'assets', asset.id), rest),
      60000,
      `Upload for "${asset.name}" timed out. The file might be too large or the connection is unstable.`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${projectId}/assets/${asset.id}`);
    throw error;
  }
}

export async function getCloudStorageTelemetry(): Promise<{ projects: DBProject[], totalBytes: number }> {
  const user = auth.currentUser;
  if (!user) return { projects: [], totalBytes: 0 };
  try {
    let totalBytes = 0;
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    
    const projectsWithAssets: DBProject[] = [];
    
    // Process projects and their assets
    for (const projectDoc of snap.docs) {
      const projectData = projectDoc.data() as DBProject;
      const metadataSize = new Blob([JSON.stringify(projectData)]).size;
      totalBytes += metadataSize;
      
      const assetsSnap = await getDocs(collection(db, 'projects', projectDoc.id, 'assets'));
      const assets: DBAsset[] = [];
      let projectAssetBytes = 0;
      
      assetsSnap.forEach(assetDoc => {
        const assetData = assetDoc.data() as DBAsset;
        const assetSize = new Blob([JSON.stringify(assetData)]).size;
        totalBytes += assetSize;
        projectAssetBytes += assetSize;
        assets.push(assetData);
      });

      // ONLY render projects that actively possess data inside the remote Firebase bucket
      if (assets.length > 0) {
        projectsWithAssets.push({
          ...projectData,
          assets // Attach fetched assets for size awareness if needed
        });
      }
    }
    
    return {
      projects: projectsWithAssets.sort((a, b) => b.updatedAt - a.updatedAt),
      totalBytes
    };
  } catch (error) {
    console.error("Telemetry Retrieval Error:", error);
    return { projects: [], totalBytes: 0 };
  }
}

export async function deleteCloudProject(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    // Delete assets subcollection first
    const assetsSnap = await getDocs(collection(db, 'projects', id, 'assets'));
    const deletePromises = assetsSnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    
    // Delete project doc
    await deleteDoc(doc(db, 'projects', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
  }
}

export async function deleteProjectEverywhere(id: string): Promise<void> {
  await deleteProject(id);
  await deleteCloudProject(id);
}

export async function purgeAllCloudData(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    for (const projectDoc of snap.docs) {
      await deleteCloudProject(projectDoc.id);
    }
  } catch (error) {
    console.error("Purge Error:", error);
  }
}
