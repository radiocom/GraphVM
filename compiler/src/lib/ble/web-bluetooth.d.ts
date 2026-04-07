/**
 * Minimal Web Bluetooth API type declarations.
 */

interface BluetoothRequestDeviceFilter {
	services?: BluetoothServiceUUID[];
	name?: string;
	namePrefix?: string;
}

interface RequestDeviceOptions {
	filters?: BluetoothRequestDeviceFilter[];
	optionalServices?: BluetoothServiceUUID[];
	acceptAllDevices?: boolean;
}

type BluetoothServiceUUID = string | number;
type BluetoothCharacteristicUUID = string | number;

interface BluetoothRemoteGATTServer {
	device: BluetoothDevice;
	connected: boolean;
	connect(): Promise<BluetoothRemoteGATTServer>;
	disconnect(): void;
	getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
	device: BluetoothDevice;
	uuid: string;
	getCharacteristic(
		characteristic: BluetoothCharacteristicUUID
	): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
	service: BluetoothRemoteGATTService;
	uuid: string;
	value: DataView | null;
	readValue(): Promise<DataView>;
	writeValueWithResponse(value: BufferSource): Promise<void>;
	writeValueWithoutResponse(value: BufferSource): Promise<void>;
	startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
	stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothAdvertisingEvent extends Event {
	device: BluetoothDevice;
	rssi: number;
	name?: string;
}

interface BluetoothDevice extends EventTarget {
	id: string;
	name?: string;
	gatt?: BluetoothRemoteGATTServer;
	watchAdvertisements(options?: { signal?: AbortSignal }): Promise<void>;
	readonly watchingAdvertisements: boolean;
}

interface Bluetooth extends EventTarget {
	requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
	getDevices(): Promise<BluetoothDevice[]>;
	getAvailability(): Promise<boolean>;
}

interface Navigator {
	bluetooth: Bluetooth;
}
