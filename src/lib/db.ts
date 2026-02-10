import { firestore } from './firebase';

const ROOT_COLLECTION = '10xclassify';
const MAX_STRING_SIZE = 900000; // ~900KB limit for any single string field to stay under Firestore's 1MB total doc limit

function sanitizeRow(row: any) {
    const sanitized = { ...row };
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'string' && sanitized[key].length > MAX_STRING_SIZE) {
            console.warn(`Truncating field ${key} due to Firestore size limits (${sanitized[key].length} bytes)`);
            sanitized[key] = sanitized[key].substring(0, MAX_STRING_SIZE) + "...[TRUNCATED]";
        }
    }
    return sanitized;
}

export const db = {
    /**
     * Generic query-like helper for Firestore.
     * Note: Firestore doesn't use SQL. This helper simulates basic 'SELECT' if possible.
     */
    async query(table: string, options: { where?: [string, any, any][], limit?: number, orderBy?: [string, 'asc' | 'desc'][] } = {}) {
        try {
            let query: any = firestore.collection(ROOT_COLLECTION).doc(table).collection('records');

            if (options.where) {
                options.where.forEach(([field, op, val]) => {
                    query = query.where(field, op, val);
                });
            }

            if (options.orderBy) {
                options.orderBy.forEach(([field, dir]) => {
                    query = query.orderBy(field, dir);
                });
            }

            if (options.limit) {
                query = query.limit(options.limit);
            }

            const snapshot = await query.get();
            return snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`Firestore Query Error in ${table}:`, error);
            throw error;
        }
    },

    async insert(table: string, rows: any[]) {
        try {
            const batch = firestore.batch();
            const collectionRef = firestore.collection(ROOT_COLLECTION).doc(table).collection('records');

            rows.forEach(row => {
                // Determine doc ID: use 'id' field if exists, else auto-gen
                const docId = row.id ? String(row.id) : collectionRef.doc().id;
                const docRef = collectionRef.doc(docId);
                // Sanitize to handle size limits
                const sanitizedRow = sanitizeRow(row);
                // Ensure id is stored in document if it wasn't there
                const data = { ...sanitizedRow, id: docId };
                batch.set(docRef, data);
            });

            await batch.commit();
        } catch (error) {
            console.error(`Firestore Insert Error in ${table}:`, error);
            throw error;
        }
    },

    async update(table: string, id: string | number, data: any) {
        try {
            const sanitizedData = sanitizeRow(data);
            const docRef = firestore.collection(ROOT_COLLECTION).doc(table).collection('records').doc(String(id));
            await docRef.update(sanitizedData);
        } catch (error) {
            console.error(`Firestore Update Error in ${table}:`, error);
            throw error;
        }
    },

    async delete(table: string, id: string | number) {
        try {
            const docRef = firestore.collection(ROOT_COLLECTION).doc(table).collection('records').doc(String(id));
            await docRef.delete();
        } catch (error) {
            console.error(`Firestore Delete Error in ${table}:`, error);
            throw error;
        }
    },

    async deleteMany(table: string, ids: (string | number)[]) {
        try {
            const batch = firestore.batch();
            const collectionRef = firestore.collection(ROOT_COLLECTION).doc(table).collection('records');

            ids.forEach(id => {
                const docRef = collectionRef.doc(String(id));
                batch.delete(docRef);
            });

            await batch.commit();
        } catch (error) {
            console.error(`Firestore DeleteMany Error in ${table}:`, error);
            throw error;
        }
    }
};
