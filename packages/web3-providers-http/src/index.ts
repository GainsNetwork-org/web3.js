import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import {
    IWeb3Provider,
    RpcResponse,
    RequestArguments,
    Web3ProviderEvents,
    ProviderEventListener,
} from 'web3-core-types/lib/types';

export default class Web3ProvidersHttp
    extends EventEmitter
    implements IWeb3Provider
{
    private _httpClient: AxiosInstance;
    private _clientChainId: string | undefined;
    private _connected = false;

    web3Client: string;

    constructor(web3Client: string) {
        super();
        this._httpClient = Web3ProvidersHttp._createHttpClient(web3Client);
        this.web3Client = web3Client;
        this._connectToClient();
    }

    private static _validateProviderUrl(providerUrl: string): boolean {
        try {
            return (
                typeof providerUrl !== 'string' ||
                /^http(s)?:\/\//i.test(providerUrl)
            );
        } catch (error) {
            throw Error(`Failed to validate provider string: ${error.message}`);
        }
    }

    private static _createHttpClient(baseUrl: string): AxiosInstance {
        try {
            if (!Web3ProvidersHttp._validateProviderUrl(baseUrl))
                throw Error('Invalid HTTP(S) URL provided');
            return axios.create({ baseURL: baseUrl });
        } catch (error) {
            throw Error(`Failed to create HTTP client: ${error.message}`);
        }
    }

    setWeb3Client(web3Client: string) {
        try {
            this._httpClient = Web3ProvidersHttp._createHttpClient(web3Client);
            this.web3Client = web3Client;
            this._connectToClient();
        } catch (error) {
            throw Error(`Failed to set web3 client: ${error.message}`);
        }
    }

    on(
        web3ProviderEvents: Web3ProviderEvents,
        listener: ProviderEventListener
    ): this {
        return super.on(web3ProviderEvents, listener);
    }

    supportsSubscriptions() {
        return false;
    }

    async request(args: RequestArguments): Promise<RpcResponse> {
        try {
            if (this._httpClient === undefined)
                throw Error('No HTTP client initiliazed');
            const arrayParams =
                args.params === undefined || Array.isArray(args.params)
                    ? args.params || []
                    : Object.values(args.params);
            const response = await this._httpClient.post(
                '', // URL path
                {
                    ...args.rpcOptions,
                    method: args.method,
                    params: arrayParams,
                },
                args.providerOptions?.axiosConfig || {}
            );

            // If the above call was successful, then we're connected
            // to the client, and should emit accordingly (EIP-1193)
            // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#connect-1
            if (this._connected === false) this._connectToClient();

            return response.data.data ? response.data.data : response.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED' && this._connected) {
                this._connected = false;
                // TODO replace with ProviderRpcError
                this.emit('disconnect', { code: 4900 });
            }
            // TODO Fancy error detection that complies with EIP1193 defined errors
            // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#provider-errors
            throw Error(error.message);
        }
    }

    private async _connectToClient() {
        try {
            const chainId = await this._getChainId();
            this.emit('connect', { chainId });
            this._connected = true;

            // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#chainchanged-1
            if (
                this._clientChainId !== undefined &&
                chainId !== this._clientChainId
            ) {
                this.emit('chainChanged', chainId);
            }
            this._clientChainId = chainId;
        } catch (error) {
            throw Error(`Error connecting to client: ${error.message}`);
        }
    }

    private async _getChainId(): Promise<string> {
        const result = await this.request({
            method: 'eth_chainId',
            params: [],
        });
        return result.result;
    }
}