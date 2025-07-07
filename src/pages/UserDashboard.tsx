import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  User,
  Shield,
  Scan,
  Package,
  ArrowRightLeft,
  Key,
  CheckCircle,
  Plus,
  Search,
  Download,
  Upload
} from 'lucide-react';
import { parseError, signTypedData } from '../utils/blockchain';
import { getEvents } from '../utils/getEvents';
import { useWallet } from '../contexts/WalletContext';
import { ethers } from 'ethers';

const UserDashboard = () => {
  const {
    account,
    ownershipRContract,
    ownershipSContract,
    authenticityRContract,
    authenticitySContract,
    isUserRegistered,
    userRegisteredName,
    connectWallet,
    checkUserRegistration
  } = useWallet();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [username, setUsername] = useState('');
  const [myItems, setMyItems] = useState<any[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const [verificationData, setVerificationData] = useState({
    name: '',
    uniqueId: '',
    serial: '',
    date: '',
    owner: '',
    metadata: '',
    signature: ''
  });

  const [transferData, setTransferData] = useState({
    itemId: '',
    tempOwnerAddress: ''
  });

  const [claimData, setClaimData] = useState({
    ownershipCode: ''
  });

  // Load user's items when component mounts or account changes
  useEffect(() => {
    if (account && ownershipRContract) {
      loadMyItems();
    }
  }, [account, ownershipRContract]);

  const loadMyItems = async () => {
    if (!ownershipRContract || !account) return;
    
    try {
      setIsLoadingItems(true);
      const items = await ownershipRContract.getAllMyItems();
      setMyItems(items);
      console.log('Loaded items:', items);
    } catch (error: any) {
      console.error('Error loading items:', error);
      // Don't show error toast for empty items, it's normal for new users
      if (!error.message.includes('No items found')) {
        toast.error(`Failed to load items: ${parseError(error)}`);
      }
    } finally {
      setIsLoadingItems(false);
    }
  };

  const registerUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownershipSContract || !username.trim()) {
      toast.error('Please enter a username');
      return;
    }

    try {
      if (username.length < 3) {
        throw new Error('Username must be at least 3 characters');
      }
      
      const tx = await ownershipSContract.userRegisters(username);
      await tx.wait();
      
      // Refresh registration status
      await checkUserRegistration();
      
      toast.success(`User "${username}" registered successfully!`);
      setUsername('');
    } catch (error: any) {
      toast.error(`Registration failed: ${parseError(error)}`);
    }
  };

  const verifyProductAuthenticity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticityRContract) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      if (!verificationData.name || !verificationData.uniqueId || !verificationData.serial || 
          !verificationData.date || !verificationData.owner || !verificationData.metadata || 
          !verificationData.signature) {
        throw new Error('All fields are required for verification');
      }
      
      const metadata = verificationData.metadata.split(',').map(item => item.trim()).filter(Boolean);
      
      const cert = {
        name: verificationData.name,
        uniqueId: verificationData.uniqueId,
        serial: verificationData.serial,
        date: parseInt(verificationData.date),
        owner: verificationData.owner,
        metadataHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string[]'], [metadata])),
        metadata
      };
      
      const result = await authenticityRContract.verifyAuthenticity(cert, verificationData.signature);
      const isValid = result[0];
      const manufacturerName = result[1];
      
      if (isValid) {
        toast.success(`Product "${verificationData.name}" is authentic! Manufacturer: ${manufacturerName}`);
      } else {
        toast.error('Product authenticity could not be verified!');
      }
      
      setVerificationData({
        name: '',
        uniqueId: '',
        serial: '',
        date: '',
        owner: '',
        metadata: '',
        signature: ''
      });
    } catch (error: any) {
      toast.error(`Verification failed: ${parseError(error)}`);
    }
  };

  const claimOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticitySContract) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      if (!verificationData.name || !verificationData.uniqueId || !verificationData.signature) {
        throw new Error('Product name, unique ID, and signature are required');
      }
      
      const metadata = verificationData.metadata.split(',').map(item => item.trim()).filter(Boolean);
      
      const cert = {
        name: verificationData.name,
        uniqueId: verificationData.uniqueId,
        serial: verificationData.serial,
        date: parseInt(verificationData.date),
        owner: verificationData.owner,
        metadataHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string[]'], [metadata])),
        metadata
      };
      
      const tx = await authenticitySContract.userClaimOwnership(cert, verificationData.signature);
      await tx.wait();
      
      toast.success('Ownership claimed successfully!');
      // Reload items after claiming ownership
      await loadMyItems();
      setVerificationData({
        name: '',
        uniqueId: '',
        serial: '',
        date: '',
        owner: '',
        metadata: '',
        signature: ''
      });
    } catch (error: any) {
      toast.error(`Claim failed: ${parseError(error)}`);
    }
  };

  const generateTransferCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownershipSContract) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      if (!transferData.itemId || !transferData.tempOwnerAddress) {
        throw new Error('Item ID and temporary owner address are required');
      }
      
      if (!ethers.isAddress(transferData.tempOwnerAddress)) {
        throw new Error('Invalid temporary owner address');
      }
      
      const tx = await ownershipSContract.generateChangeOfOwnershipCode(
        transferData.itemId, 
        transferData.tempOwnerAddress
      );
      const receipt = await tx.wait();
      
      const eventData = getEvents(ownershipSContract, receipt, 'OwnershipCode');
      toast.success(`Transfer code generated: ${eventData.ownershipCode}`);
      
      setTransferData({
        itemId: '',
        tempOwnerAddress: ''
      });
    } catch (error: any) {
      toast.error(`Transfer code generation failed: ${parseError(error)}`);
    }
  };

  const claimWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownershipSContract) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      if (!claimData.ownershipCode || !ethers.isBytesLike(claimData.ownershipCode)) {
        throw new Error('Valid ownership code required');
      }
      
      const tx = await ownershipSContract.newOwnerClaimOwnership(claimData.ownershipCode);
      const receipt = await tx.wait();
      
      const eventData = getEvents(ownershipSContract, receipt, 'OwnershipClaimed');
      toast.success('Ownership claimed with code successfully!');
      // Reload items after claiming ownership
      await loadMyItems();
      
      setClaimData({ ownershipCode: '' });
    } catch (error: any) {
      toast.error(`Claim failed: ${parseError(error)}`);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'register', label: 'Register', icon: Plus },
    { id: 'verify', label: 'Verify Product', icon: Shield },
    { id: 'claim', label: 'Claim Ownership', icon: Key },
    { id: 'transfer', label: 'Transfer Ownership', icon: ArrowRightLeft },
    { id: 'my-items', label: 'My Items', icon: Package }
  ];

  if (!account) {
    return (
      <div className="pt-16 min-h-screen bg-gradient-to-br from-blue-50 to-orange-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <User className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              User Dashboard
            </h2>
            <p className="text-gray-600 mb-8">
              Connect your wallet to access user features
            </p>
            <button
              onClick={connectWallet}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-br from-blue-50 to-orange-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">User Dashboard</h1>
                <p className="text-gray-600">
                  {userRegisteredName ? `Welcome, ${userRegisteredName}` : `Connected: ${account.slice(0, 6)}...${account.slice(-4)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                isUserRegistered 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isUserRegistered ? 'Registered' : 'Not Registered'}
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
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
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
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                      <Package className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Owned Items</h3>
                      <p className="text-3xl font-bold">
                        {isLoadingItems ? '...' : myItems.length}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
                      <Shield className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Verified Products</h3>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                      <ArrowRightLeft className="h-8 w-8 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Transfers</h3>
                      <p className="text-3xl font-bold">0</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <button
                        onClick={() => setActiveTab('verify')}
                        className="flex items-center space-x-3 p-4 rounded-lg border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300"
                      >
                        <Scan className="h-5 w-5" />
                        <span>Verify Product</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('claim')}
                        className="flex items-center space-x-3 p-4 rounded-lg border-2 border-dashed border-emerald-300 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50 transition-all duration-300"
                      >
                        <Key className="h-5 w-5" />
                        <span>Claim Ownership</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Register Tab */}
              {activeTab === 'register' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Register as User</h2>
                  {!isUserRegistered ? (
                    <form onSubmit={registerUser} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Username
                        </label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                          placeholder="Enter your username (min 3 characters)"
                          minLength={3}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Register User
                      </button>
                    </form>
                  ) : (
                    <div className="text-center py-12">
                      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Already Registered</h3>
                      <p className="text-gray-600">You are successfully registered as a user.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Verify Product Tab */}
              {activeTab === 'verify' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Verify Product Authenticity</h2>
                  <form onSubmit={verifyProductAuthenticity} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Product Name
                        </label>
                        <input
                          type="text"
                          value={verificationData.name}
                          onChange={(e) => setVerificationData({...verificationData, name: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
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
                          value={verificationData.uniqueId}
                          onChange={(e) => setVerificationData({...verificationData, uniqueId: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                          placeholder="Product unique identifier"
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Serial Number
                        </label>
                        <input
                          type="text"
                          value={verificationData.serial}
                          onChange={(e) => setVerificationData({...verificationData, serial: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                          placeholder="Product serial number"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date (Unix timestamp)
                        </label>
                        <input
                          type="number"
                          value={verificationData.date}
                          onChange={(e) => setVerificationData({...verificationData, date: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                          placeholder="Manufacturing date"
                          required
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Owner Address
                      </label>
                      <input
                        type="text"
                        value={verificationData.owner}
                        onChange={(e) => setVerificationData({...verificationData, owner: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                        placeholder="Product owner address"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Metadata (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={verificationData.metadata}
                        onChange={(e) => setVerificationData({...verificationData, metadata: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                        placeholder="e.g., Black, 128GB, Pro Model"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Signature
                      </label>
                      <textarea
                        value={verificationData.signature}
                        onChange={(e) => setVerificationData({...verificationData, signature: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                        placeholder="Product signature from manufacturer"
                        rows={3}
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      Verify Product Authenticity
                    </button>
                  </form>
                </div>
              )}

              {/* Claim Ownership Tab */}
              {activeTab === 'claim' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Claim Product Ownership</h2>
                  
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Method 1: Claim with Product Details</h3>
                    <form onSubmit={claimOwnership} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Product Name
                          </label>
                          <input
                            type="text"
                            value={verificationData.name}
                            onChange={(e) => setVerificationData({...verificationData, name: e.target.value})}
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
                            value={verificationData.uniqueId}
                            onChange={(e) => setVerificationData({...verificationData, uniqueId: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                            placeholder="Product unique identifier"
                            required
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Signature
                        </label>
                        <textarea
                          value={verificationData.signature}
                          onChange={(e) => setVerificationData({...verificationData, signature: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-300"
                          placeholder="Product signature from manufacturer"
                          rows={3}
                          required
                        />
                      </div>
                      
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Claim Ownership
                      </button>
                    </form>
                  </div>

                  <div className="border-t border-gray-200 pt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Method 2: Claim with Ownership Code</h3>
                    <form onSubmit={claimWithCode} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ownership Code
                        </label>
                        <input
                          type="text"
                          value={claimData.ownershipCode}
                          onChange={(e) => setClaimData({...claimData, ownershipCode: e.target.value})}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors duration-300"
                          placeholder="Enter ownership transfer code"
                          required
                        />
                      </div>
                      
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-orange-600 to-orange-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-orange-700 hover:to-orange-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Claim with Code
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Transfer Ownership Tab */}
              {activeTab === 'transfer' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Transfer Ownership</h2>
                  <form onSubmit={generateTransferCode} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Item ID
                      </label>
                      <input
                        type="text"
                        value={transferData.itemId}
                        onChange={(e) => setTransferData({...transferData, itemId: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-300"
                        placeholder="Enter item ID to transfer"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        New Owner Address
                      </label>
                      <input
                        type="text"
                        value={transferData.tempOwnerAddress}
                        onChange={(e) => setTransferData({...transferData, tempOwnerAddress: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-300"
                        placeholder="Enter new owner's wallet address"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-700 hover:to-purple-800 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      Generate Transfer Code
                    </button>
                  </form>
                </div>
              )}

              {/* My Items Tab */}
              {activeTab === 'my-items' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">My Items</h2>
                  
                  {isLoadingItems ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading your items...</p>
                    </div>
                  ) : myItems.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Items Found</h3>
                      <p className="text-gray-600 mb-6">
                        You don't own any verified items yet. Start by claiming ownership of a product.
                      </p>
                      <button
                        onClick={() => setActiveTab('claim')}
                        className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors duration-300"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Claim Your First Item</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-600">
                          You own {myItems.length} verified item{myItems.length !== 1 ? 's' : ''}
                        </p>
                        <button
                          onClick={loadMyItems}
                          className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700 transition-colors duration-300"
                        >
                          <Search className="h-4 w-4" />
                          <span>Refresh</span>
                        </button>
                      </div>
                      
                      <div className="grid gap-6">
                        {myItems.map((item, index) => (
                          <div key={index} className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-blue-300 transition-colors duration-300">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                  {item.name}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  by {item.manufacturer}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                  Verified
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Item ID</p>
                                <p className="text-sm text-gray-600 font-mono bg-white px-3 py-2 rounded border">
                                  {item.itemId}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Serial Number</p>
                                <p className="text-sm text-gray-600 font-mono bg-white px-3 py-2 rounded border">
                                  {item.serial}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Manufacturing Date</p>
                                <p className="text-sm text-gray-600">
                                  {new Date(Number(item.date) * 1000).toLocaleDateString()}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Owner Address</p>
                                <p className="text-sm text-gray-600 font-mono">
                                  {item.owner.slice(0, 6)}...{item.owner.slice(-4)}
                                </p>
                              </div>
                            </div>
                            
                            {item.metadata && item.metadata.length > 0 && (
                              <div className="mb-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">Product Details</p>
                                <div className="flex flex-wrap gap-2">
                                  {item.metadata.map((meta: string, metaIndex: number) => (
                                    <span
                                      key={metaIndex}
                                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                                    >
                                      {meta}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                              <div className="flex items-center space-x-2 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-sm font-medium">Authenticity Verified</span>
                              </div>
                              <button
                                onClick={() => {
                                  setTransferData({...transferData, itemId: item.itemId});
                                  setActiveTab('transfer');
                                }}
                                className="inline-flex items-center space-x-2 text-purple-600 hover:text-purple-700 transition-colors duration-300"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                                <span className="text-sm font-medium">Transfer</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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

export default UserDashboard;