
const CLIENT_ID = '216372984510-8k3sgng5qprn3qglmfk06l2v03me4bdc.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBSrTyDx1cJHQyAOX8kZ0xfp6lFOfScfok';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
}

// Typing for window globals injected by scripts
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleDrive = (onInitComplete: (available: boolean) => void) => {
  const checkGapi = () => {
    if (window.gapi) {
        window.gapi.load('client', async () => {
            await window.gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            gapiInited = true;
            if (gisInited) onInitComplete(true);
        });
    } else {
        setTimeout(checkGapi, 500);
    }
  };

  const checkGis = () => {
      if (window.google) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined at request time
        });
        gisInited = true;
        if (gapiInited) onInitComplete(true);
      } else {
          setTimeout(checkGis, 500);
      }
  };

  checkGapi();
  checkGis();
};

export const loginToGoogle = async (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp: any) => {
            if (resp.error) {
                reject(resp);
            }
            resolve(true);
        };

        if (window.gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({prompt: ''});
        }
    });
};

export const listBackups = async (): Promise<DriveFile[]> => {
    try {
        const response = await window.gapi.client.drive.files.list({
            'pageSize': 20,
            'fields': "nextPageToken, files(id, name, createdTime)",
            'q': "name contains 'FamilyFlow_Backup_' and trashed = false",
            'orderBy': 'createdTime desc'
        });
        return response.result.files;
    } catch (err) {
        console.error("Error listing files", err);
        throw err;
    }
};

export const createBackupFile = async (content: string, filename: string) => {
    try {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const contentType = 'application/json';

        const metadata = {
            'name': filename,
            'mimeType': contentType
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + contentType + '\r\n\r\n' +
            content +
            close_delim;

        const request = window.gapi.client.request({
            'path': '/upload/drive/v3/files',
            'method': 'POST',
            'params': { 'uploadType': 'multipart' },
            'headers': {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            'body': multipartRequestBody
        });

        await request;
        return true;
    } catch (err) {
        console.error("Error creating file", err);
        throw err;
    }
};

export const loadBackupFile = async (fileId: string): Promise<string> => {
    try {
        const response = await window.gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        // Depending on response format, it might be result or body
        return typeof response.body === 'string' ? response.body : JSON.stringify(response.result);
    } catch (err) {
        console.error("Error reading file", err);
        throw err;
    }
};

export const deleteBackupFile = async (fileId: string) => {
    try {
        await window.gapi.client.drive.files.delete({
            fileId: fileId
        });
        return true;
    } catch (err) {
        console.error("Error deleting file", err);
        throw err;
    }
};
