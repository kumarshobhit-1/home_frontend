import { useEffect, useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import {
  Bell,
  Droplets,
  Fan,
  Lightbulb,
  Lock,
  Power,
  ShieldAlert,
  Smartphone,
  Thermometer,
  Unlock,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const BLOCKCHAIN_RPC_URL = import.meta.env.VITE_BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:7545';
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0bd235EBe41CF0d7C4638A774ef20bdF9C271E57';
const DEFAULT_USER = import.meta.env.VITE_DEFAULT_USER || 'Admin (Vansh)';
const WOKWI_SIM_URL = import.meta.env.VITE_WOKWI_SIM_URL || '';

const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: 'string', name: '_action', type: 'string' },
      { internalType: 'string', name: '_user', type: 'string' },
      { internalType: 'uint256', name: '_timestamp', type: 'uint256' },
    ],
    name: 'addLog',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getLogs',
    outputs: [
      {
        components: [
          { internalType: 'string', name: 'action', type: 'string' },
          { internalType: 'string', name: 'user', type: 'string' },
          { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
        ],
        internalType: 'struct HomeSecurity.Log[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'securityLogs',
    outputs: [
      { internalType: 'string', name: 'action', type: 'string' },
      { internalType: 'string', name: 'user', type: 'string' },
      { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

function App() {
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [status, setStatus] = useState({ temp: null, hum: null, mcb_status: true, updatedAt: null });
  const [streamConnected, setStreamConnected] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [backendHealth, setBackendHealth] = useState({ mqttConnected: false, blockchainEnabled: false });

  const [deviceStatus, setDeviceStatus] = useState({
    door: 'locked',
    light: false,
    fan: false,
    mcb: true,
  });

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const rawLogs = await contract.getLogs();

      const formattedLogs = rawLogs
        .map((log) => ({
          action: log.action,
          user: log.user,
          timestamp: Number(log.timestamp) * 1000,
        }))
        .reverse();

      setLogs(formattedLogs);
    } catch (error) {
      console.error('Blockchain read error:', error);
    }
    setLoadingLogs(false);
  };

  const fetchDeviceStatus = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/device/status`);
      if (data?.status) {
        setStatus(data.status);
      }
    } catch (error) {
      console.error('Device status read error:', error);
    }
  };

  const fetchHealth = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/health`);
      setBackendHealth({
        mqttConnected: Boolean(data?.mqttConnected),
        blockchainEnabled: Boolean(data?.blockchainEnabled),
      });
    } catch (error) {
      setBackendHealth({ mqttConnected: false, blockchainEnabled: false });
      console.error('Health check error:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchDeviceStatus();
    fetchHealth();

    const timerId = setInterval(() => {
      fetchDeviceStatus();
      fetchHealth();
    }, 10000);

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/device/stream`);

    eventSource.onopen = () => setStreamConnected(true);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setStatus(payload);
      } catch (error) {
        console.error('Stream parse error:', error);
      }
    };

    eventSource.onerror = () => {
      setStreamConnected(false);
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const notifyOnDevice = (title, body) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('This browser does not support notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  };

  const sendCommand = async (device, command) => {
    if (!deviceStatus.mcb && command !== 'MCB_ON') {
      alert('SYSTEM IN LOCKDOWN: Cannot send commands until MCB is restored.');
      return;
    }

    setActionLoading(command);

    if (command === 'DOOR_OPEN') setDeviceStatus((prev) => ({ ...prev, door: 'unlocked' }));
    if (command === 'DOOR_CLOSE') setDeviceStatus((prev) => ({ ...prev, door: 'locked' }));
    if (command === 'LIGHT_ON') setDeviceStatus((prev) => ({ ...prev, light: true }));
    if (command === 'LIGHT_OFF') setDeviceStatus((prev) => ({ ...prev, light: false }));
    if (command === 'FAN_ON') setDeviceStatus((prev) => ({ ...prev, fan: true }));
    if (command === 'FAN_OFF') setDeviceStatus((prev) => ({ ...prev, fan: false }));
    if (command === 'MCB_OFF') setDeviceStatus({ door: 'locked', light: false, fan: false, mcb: false });
    if (command === 'MCB_ON') setDeviceStatus((prev) => ({ ...prev, mcb: true }));

    try {
      await axios.post(`${API_BASE_URL}/api/device/control`, {
        device,
        command,
        user: DEFAULT_USER,
      });
      notifyOnDevice('Smart Home Command Sent', `${device} -> ${command}`);
      setTimeout(fetchLogs, 1500);
    } catch (error) {
      console.error('Backend error:', error);
    }
    setActionLoading(null);
  };

  return (
    <div
      className={`min-h-screen p-4 sm:p-6 md:p-8 font-sans transition-colors duration-500 ${
        !deviceStatus.mcb ? 'bg-red-950' : 'bg-gray-900'
      } text-white`}
    >
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:justify-between md:items-end border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-blue-400 tracking-tight flex items-center gap-3">
              <Power className={!deviceStatus.mcb ? 'text-red-500 animate-pulse' : 'text-blue-400'} size={36} />
              Smart Home Command
            </h1>
            <p className="text-gray-400 mt-2 text-sm sm:text-base md:text-lg">Live Visualization & Blockchain Audit</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={enableNotifications}
              className={`px-3 py-2 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${
                notificationsEnabled
                  ? 'bg-green-900/30 border-green-500 text-green-300'
                  : 'bg-slate-800 border-slate-600 text-slate-200'
              }`}
            >
              <Bell size={14} /> {notificationsEnabled ? 'Phone Alerts On' : 'Enable Alerts'}
            </button>

            {WOKWI_SIM_URL ? (
              <a
                href={WOKWI_SIM_URL}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-full text-xs font-bold border border-blue-500 text-blue-300 bg-blue-900/20 inline-flex items-center gap-1"
              >
                <Smartphone size={14} /> Open Wokwi Sim
              </a>
            ) : null}

            <div
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold border ${
                deviceStatus.mcb
                  ? 'bg-green-900/30 border-green-500 text-green-400'
                  : 'bg-red-900/50 border-red-500 text-red-500 animate-pulse'
              }`}
            >
              {deviceStatus.mcb ? 'SYSTEM ONLINE' : 'CRITICAL LOCKDOWN'}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">IoT Stream</p>
            <p className={`text-sm font-semibold ${streamConnected ? 'text-green-300' : 'text-red-300'}`}>
              {streamConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">Backend + MQTT</p>
            <p className={`text-sm font-semibold ${backendHealth.mqttConnected ? 'text-green-300' : 'text-red-300'}`}>
              {backendHealth.mqttConnected ? 'Healthy' : 'Not Reachable'}
            </p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">Blockchain Relayer</p>
            <p
              className={`text-sm font-semibold ${
                backendHealth.blockchainEnabled ? 'text-green-300' : 'text-yellow-300'
              }`}
            >
              {backendHealth.blockchainEnabled ? 'Enabled' : 'Disabled / Unavailable'}
            </p>
          </div>
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">Last Sensor Update</p>
            <p className="text-sm font-semibold text-slate-200">
              {status.updatedAt ? new Date(status.updatedAt).toLocaleTimeString() : 'No data yet'}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center gap-3">
            <Thermometer className="text-orange-300" />
            <div>
              <p className="text-xs text-gray-400">Temperature</p>
              <p className="text-lg font-bold">{typeof status.temp === 'number' ? `${status.temp.toFixed(1)} C` : 'N/A'}</p>
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center gap-3">
            <Droplets className="text-cyan-300" />
            <div>
              <p className="text-xs text-gray-400">Humidity</p>
              <p className="text-lg font-bold">{typeof status.hum === 'number' ? `${status.hum.toFixed(1)} %` : 'N/A'}</p>
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center gap-3">
            <ShieldAlert className={status.mcb_status ? 'text-green-300' : 'text-red-300'} />
            <div>
              <p className="text-xs text-gray-400">Physical MCB State (IoT)</p>
              <p className="text-lg font-bold">{status.mcb_status ? 'ON' : 'OFF'}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col items-center justify-between">
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-xl font-bold text-gray-300">Main Door</span>
                <span
                  className={`text-sm font-bold px-3 py-1 rounded-full ${
                    deviceStatus.door === 'unlocked' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {deviceStatus.door.toUpperCase()}
                </span>
              </div>
              <div className="py-8">
                {deviceStatus.door === 'unlocked' ? (
                  <Unlock size={80} className="text-green-500" />
                ) : (
                  <Lock size={80} className="text-red-500" />
                )}
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button
                  onClick={() => sendCommand('Main Door', 'DOOR_OPEN')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'DOOR_OPEN' ? 'Sending...' : 'Unlock'}
                </button>
                <button
                  onClick={() => sendCommand('Main Door', 'DOOR_CLOSE')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'DOOR_CLOSE' ? 'Sending...' : 'Lock'}
                </button>
              </div>
            </div>

            <div
              className={`bg-gray-800 p-6 rounded-2xl border ${
                deviceStatus.light ? 'border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.15)]' : 'border-gray-700 shadow-xl'
              } flex flex-col items-center justify-between transition-all duration-500`}
            >
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-xl font-bold text-gray-300">Living Room Light</span>
                <span
                  className={`text-sm font-bold px-3 py-1 rounded-full ${
                    deviceStatus.light ? 'bg-yellow-900/50 text-yellow-400' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {deviceStatus.light ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="py-8">
                <Lightbulb
                  size={80}
                  className={`transition-all duration-500 ${
                    deviceStatus.light ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]' : 'text-gray-600'
                  }`}
                />
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button
                  onClick={() => sendCommand('Living Room Light', 'LIGHT_ON')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'LIGHT_ON' ? 'Sending...' : 'Turn On'}
                </button>
                <button
                  onClick={() => sendCommand('Living Room Light', 'LIGHT_OFF')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'LIGHT_OFF' ? 'Sending...' : 'Turn Off'}
                </button>
              </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col items-center justify-between">
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-xl font-bold text-gray-300">Climate Fan</span>
                <span
                  className={`text-sm font-bold px-3 py-1 rounded-full ${
                    deviceStatus.fan ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {deviceStatus.fan ? 'SPINNING' : 'STOPPED'}
                </span>
              </div>
              <div className="py-8">
                <Fan
                  size={80}
                  className={`${deviceStatus.fan ? 'text-blue-400 animate-spin' : 'text-gray-600'} transition-colors duration-500`}
                  style={{ animationDuration: '0.8s' }}
                />
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button
                  onClick={() => sendCommand('Ceiling Fan', 'FAN_ON')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'FAN_ON' ? 'Sending...' : 'Start'}
                </button>
                <button
                  onClick={() => sendCommand('Ceiling Fan', 'FAN_OFF')}
                  disabled={Boolean(actionLoading)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg font-bold transition disabled:opacity-50"
                >
                  {actionLoading === 'FAN_OFF' ? 'Sending...' : 'Stop'}
                </button>
              </div>
            </div>

            <div
              className={`p-6 rounded-2xl border shadow-xl flex flex-col justify-center items-center text-center ${
                deviceStatus.mcb
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-red-900/30 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
              }`}
            >
              <ShieldAlert size={64} className={`mb-4 ${deviceStatus.mcb ? 'text-gray-600' : 'text-red-500 animate-bounce'}`} />
              <h3 className="text-xl font-black mb-2">{deviceStatus.mcb ? 'Master Power' : 'SYSTEM HALTED'}</h3>
              <p className="text-sm text-gray-400 mb-6">Triggers physical alarm and cuts hardware power.</p>

              {deviceStatus.mcb ? (
                <button
                  onClick={() => sendCommand('Master System', 'MCB_OFF')}
                  disabled={Boolean(actionLoading)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl transition shadow-lg disabled:opacity-50"
                >
                  {actionLoading === 'MCB_OFF' ? 'Sending...' : 'TRIP MCB (LOCKDOWN)'}
                </button>
              ) : (
                <button
                  onClick={() => sendCommand('Master System', 'MCB_ON')}
                  disabled={Boolean(actionLoading)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl transition shadow-lg animate-pulse disabled:opacity-50"
                >
                  {actionLoading === 'MCB_ON' ? 'Sending...' : 'RESTORE POWER'}
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col h-[620px] md:h-[800px]">
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
              <h2 className="text-xl font-bold text-white">Blockchain Ledger</h2>
              <button onClick={fetchLogs} className="text-xs bg-blue-600 hover:bg-blue-500 font-bold px-3 py-1.5 rounded transition">
                {loadingLogs ? 'Syncing...' : 'Refresh'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 italic mt-10">
                  Ledger is empty. Make sure blockchain RPC and contract address are configured.
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-500 mb-1">{new Date(log.timestamp).toLocaleString()}</div>
                    <div className="font-mono text-green-400 text-sm">{log.action}</div>
                    <div className="text-xs text-blue-400 mt-2 text-right">by {log.user}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
