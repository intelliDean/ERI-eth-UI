import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';
import {
  Factory,
  Shield,
  QrCode,
  Users,
  Package,
  CheckCircle,
  Plus,
  Eye,
  Download
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { AUTHENTICITY_ABI } from '../contracts/authenticityABI';
import { parseError, signTypedData } from '../utils/blockchain';

const AUTHENTICITY_ADDRESS = import.meta.env.VITE_AUTHENTICITY;

const ManufacturerDashboard = () => {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [rContract, setRContract] = useState<ethers.Contract | null>(null);
  const [sContract, setSContract] = useState<ethers.Contract | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [manufacturerName, setManufacturerName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredName, setRegisteredName] = useState('');
  const [chainId, setChainId] = useState<number>(0);
  const [qrCodeData, setQrCodeData] = useState('');
  const [signature, setSignature] = useState('');

  const [certificate, setCertificate] = useState({
    name: '',
    uniqueId: '',
    serial: '',
    metadata: ''
  });

  useEffect(() => {
    if (typeof window.ethereum !== "undefined") {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);
      setRContract(new ethers.Contract(AUTHENTICITY_ADDRESS, AUTHENTICITY_ABI, web3Provider));
    } else {
      setProvider(ethers.getDefaultProvider);
      toast.error("Please install MetaMask!");
    }
  }, []);

  const connectWallet = async () => {
    if (!provider) {
      return toast.error("MetaMask not detected");
    }

    try {
      if (!account) {
        await window.ethereum.request({method: "eth_requestAccounts"});
        const signer = await provider.getSigner();

        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));

        const address = await signer.getAddress();
        setSigner(signer);
        setAccount(address);
        setSContract(new ethers.Contract(AUTHENTICITY_ADDRESS, AUTHENTICITY_ABI, signer));

        console.log("Chain ID", network.chainId);

        // Check if manufacturer is registered and get their name
        await checkManufacturerRegistration(address);

        toast.success(`Connected: ${address.slice(0, 6)}...${address.slice(-4)}`);

        return;
      }

      //to disconnect wallet
      setSigner(null);
      setAccount(null);
      setIsRegistered(false);
      setRegisteredName('');
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));

      setRContract(new ethers.Contract(AUTHENTICITY_ADDRESS, AUTHENTICITY_ABI, provider)); // to call view function
      toast.success("Wallet disconnected");

    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const checkManufacturerRegistration = async (address: string) => {
    if (!rContract) return;
    
    try {
      const manufacturer = await rContract.getManufacturer(address);
      if (manufacturer.name && manufacturer.name.trim() !== '') {
        setIsRegistered(true);
        setRegisteredName(manufacturer.name);
      }
    } catch (error) {
      // Manufacturer not registered, which is fine
      setIsRegistered(false);
      setRegisteredName('');
    }
  };

  const registerManufacturer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sContract || !manufacturerName.trim()) {
      toast.error('Please enter a manufacturer name');
      return;
    }

    try {
      const tx = await sContract.manufacturerRegisters(manufacturerName);
      await tx.wait();
      setIsRegistered(true);
      setRegisteredName(manufacturerName);
      toast.success(`Manufacturer "${manufacturerName}" registered successfully!`);
      setManufacturerName('');
    } catch (error: any) {
      toast.error(`Registration failed: ${error.message}`);
    }
  };

  const createCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sContract || !signer) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      if (!certificate.name || !certificate.uniqueId || !certificate.serial || !certificate.metadata) {
        throw new Error('All certificate fields required');
      }
      
      const timestamp = Math.floor(Date.now() / 1000);
      const metadata = certificate.metadata.split(',').map(item => item.trim()).filter(Boolean);
      
      const cert = {
        name: certificate.name,
        uniqueId: certificate.uniqueId,
        serial: certificate.serial,
        date: timestamp,
        owner: account,
        metadataHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string[]'], [metadata])),
        metadata
      };

      // Create typed data for signing
      const { domain, types, value } = signTypedData(cert, chainId);
      
      // Sign the certificate
      const signature = await signer.signTypedData(domain, types, value);
      setSignature(signature);
      
      // Verify signature locally first
      const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
      if (recoveredAddress.toLowerCase() !== account?.toLowerCase()) {
        throw new Error('Signature verification failed');
      }
      
      const qrData = JSON.stringify({ cert, signature });
      setQrCodeData(qrData);
      
      toast.success('Certificate created and signed successfully!');
      
      setCertificate({
        name: '',
        uniqueId: '',
        serial: '',
        metadata: ''
      });
    } catch (error: any) {
      toast.error(`Certificate creation failed: ${parseError(error)}`);
    }
  };

  const downloadQRCode = () => {
    const canvas = document.querySelector('#qr-code') as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `certificate-${certificate.uniqueId || 'qr'}.png`;
      link.click();
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Factory },
    { id: 'register', label: 'Register', icon: Plus },
    { id: 'certificates', label: 'Create Certificate', icon: Shield },
    { id: 'verify', label: 'Verify Products', icon: CheckCircle }
  ];

  if (!account) {
    return (
      <div className="pt-16 min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Factory className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Manufacturer Dashboard
            </h2>
            <p className="text-gray-600 mb-8">
              Connect your wallet to access manufacturer features
            </p>
            <button
              onClick={connectWallet}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Factory className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Manufacturer Dashboard</h1>
                <p className="text-gray-600">
                  {registeredName ? `Welcome, ${registeredName}` : `Connected: ${account.slice(0, 6)}...${account.slice(-4)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isRegistered 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isRegistered ? 'Registered' : 'Not Registered'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <nav className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all duration-300 ${
                      activeTab === tab.id
                        ? 'bg-emerald-100 text-emerald-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-emerald-600'
                    }`}
                  >
                    <tab.icon className="h-5 w-5" />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Overview</h2>
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
                      <Package className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Products Created</h3>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                      <QrCode className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">QR Codes Generated</h3>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                      <CheckCircle className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Verified Products</h3>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <button
                        onClick={() => setActiveTab('register')}
                        disabled={isRegistered}
                        className={`flex items-center space-x-3 p-4 rounded-lg border-2 border-dashed transition-all duration-300 ${
                          isRegistered
                            ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                            : 'border-emerald-300 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50'
                        }`}
                      >
                        <Plus className="h-5 w-5" />
                        <span>{isRegistered ? 'Already Registered' : 'Register as Manufacturer'}</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('certificates')}
                        className="flex items-center space-x-3 p-4 rounded-lg border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300"
                      >
                        <Shield className="h-5 w-5" />
                        <span>Create New Certificate</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Register Tab */}
              {activeTab === 'register' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Register as Manufacturer</h2>
                  {!isRegistered ? (
                    <form onSubmit={registerManufacturer} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Manufacturer Name
                        </label>
                        <input
                          type="text"
                          value={manufacturerName}
                          onChange={(e) => setManufacturerName(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                          placeholder="Enter your company name"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Register Manufacturer
                      </button>
                    </form>
                  ) : (
                    <div className="text-center py-12">
                      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Already Registered</h3>
                      <p className="text-gray-600">You are successfully registered as a manufacturer.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Certificates Tab */}
              {activeTab === 'certificates' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Product Certificate</h2>
                  <form onSubmit={createCertificate} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Product Name
                        </label>
                        <input
                          type="text"
                          value={certificate.name}
                          onChange={(e) => setCertificate({...certificate, name: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                          placeholder="e.g., iPhone 15 Pro"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Unique ID
                        </label>
                        <input
                          type="text"
                          value={certificate.uniqueId}
                          onChange={(e) => setCertificate({...certificate, uniqueId: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                          placeholder="e.g., IMEI, Serial Number"
                          required
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Serial Number
                      </label>
                      <input
                        type="text"
                        value={certificate.serial}
                        onChange={(e) => setCertificate({...certificate, serial: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                        placeholder="Product serial number"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Metadata (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={certificate.metadata}
                        onChange={(e) => setCertificate({...certificate, metadata: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                        placeholder="e.g., Black, 128GB, Pro Model"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      Create & Sign Certificate
                    </button>
                  </form>

                  {/* QR Code Display */}
                  {qrCodeData && (
                    <div className="mt-8 p-6 bg-gray-50 rounded-xl">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                        Certificate QR Code
                      </h3>
                      <div className="flex justify-center mb-4">
                        <QRCodeCanvas
                          id="qr-code"
                          value={qrCodeData}
                          size={200}
                          className="border border-gray-200 rounded-lg"
                        />
                      </div>
                      <div className="text-center">
                        <button
                          onClick={downloadQRCode}
                          className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-300"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download QR Code</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Verify Tab */}
              {activeTab === 'verify' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Verify Products</h2>
                  <div className="text-center py-12">
                    <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Product Verification</h3>
                    <p className="text-gray-600">
                      Use this section to verify products and view verification history.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManufacturerDashboard;