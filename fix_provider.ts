import fs from 'fs';
let content = fs.readFileSync('src/core/data/provider.ts', 'utf8');
const searchString = "  conversations: IDataProvider<ConversationData>;";
const replaceString = `  conversations: IDataProvider<ConversationData>;
  paymentMethods: IDataProvider<any>; // Actually import the types
  businessHours: IDataProvider<any>;
  deliveryConfig: IDataProvider<any>;
  storeContacts: IDataProvider<any>;
  storeLocations: IDataProvider<any>;
  storeNotices: IDataProvider<any>;`;
// Better to just rewrite the file if needed, or use sed.
