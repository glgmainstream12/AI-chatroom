// types/midtrans-client.d.ts

declare module "midtrans-client" {
    export interface Config {
      isProduction: boolean;
      serverKey: string;
      clientKey: string;
    }
  
    export interface CreateTransactionParameter {
      transaction_details: {
        order_id: string;
        gross_amount: number;
      };
      item_details?: Array<{
        id: string;
        price: number;
        quantity: number;
        name: string;
      }>;
      customer_details?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        [key: string]: any;
      };
      credit_card?: {
        secure: boolean;
      };
      [key: string]: any;
    }
  
    export interface CreateTransactionResponse {
      token: string;
      redirect_url: string;
    }
  
    export interface TransactionStatusResponse {
      order_id: string;
      transaction_status: string;
      fraud_status?: string;
      [key: string]: any;
    }
  
    /**
     * The Snap class is typically used for generating Snap tokens and redirect URLs
     * for client-side payments (https://snap-docs.midtrans.com/)
     */
    export class Snap {
      constructor(config: Config);
  
      createTransaction(
        parameter: CreateTransactionParameter
      ): Promise<CreateTransactionResponse>;
    }
  
    /**
     * The CoreApi class is commonly used for server-side transaction handling,
     * such as notification parsing, direct charge, etc.
     */
    export class CoreApi {
      constructor(config: Config);
  
      transaction: {
        notification(body: any): Promise<TransactionStatusResponse>;
        // Add more methods as needed (e.g. charge, refund, status, etc.)
      };
    }
  }