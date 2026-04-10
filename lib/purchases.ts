// SleepMind - RevenueCat Subscription Management
import Purchases, { PurchasesOffering, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';

// ─── CONFIG ───
// RevenueCat public API key (safe to include in client code)
const REVENUECAT_API_KEY = 'appl_WRiGsKYawieSkRDFZrvYTOtKXUy';

// Entitlement ID - RevenueCat dashboard'da tanımladığınız entitlement
const PRO_ENTITLEMENT = 'pro';

// ─── INIT ───
let isInitialized = false;

export async function initPurchases(): Promise<void> {
  if (isInitialized) return;

  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      isInitialized = true;
    }
  } catch (error) {
    console.error('RevenueCat init error:', error);
  }
}

// ─── CHECK PRO STATUS ───
export async function checkProStatus(forceRefresh = false): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    if (forceRefresh) {
      try { await Purchases.invalidateCustomerInfoCache(); } catch {}
    }

    const customerInfo = await Purchases.getCustomerInfo();

    // Primary check: entitlement configured in RevenueCat dashboard
    if (customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined) {
      return true;
    }

    // Fallback: any active subscription counts as PRO, even if the
    // RevenueCat dashboard entitlement mapping isn't set up yet.
    if (customerInfo.activeSubscriptions && customerInfo.activeSubscriptions.length > 0) {
      console.log('[PRO] Active via activeSubscriptions:', customerInfo.activeSubscriptions);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking pro status:', error);
    return false;
  }
}

// ─── DEBUG: RAW CUSTOMER INFO ───
export async function getCustomerInfoDebug(): Promise<string> {
  try {
    if (Platform.OS === 'web') return 'web platform';
    try { await Purchases.invalidateCustomerInfoCache(); } catch {}
    const info = await Purchases.getCustomerInfo();
    return JSON.stringify({
      originalAppUserId: info.originalAppUserId,
      activeSubscriptions: info.activeSubscriptions,
      activeEntitlements: Object.keys(info.entitlements.active),
      allEntitlements: Object.keys(info.entitlements.all),
      allPurchasedProductIds: info.allPurchasedProductIdentifiers,
      latestExpiration: info.latestExpirationDate,
    }, null, 2);
  } catch (error: any) {
    return `Error: ${error?.message || String(error)}`;
  }
}

// ─── GET OFFERINGS ───
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    if (Platform.OS === 'web') return null;

    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.error('Error getting offerings:', error);
    return null;
  }
}

// ─── PURCHASE ───
export async function purchaseProSubscription(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;

    if (!currentOffering || !currentOffering.availablePackages.length) {
      console.error('No offerings available');
      return false;
    }

    // İlk paketi satın al (genellikle aylık abonelik)
    const purchaseResult = await Purchases.purchasePackage(currentOffering.availablePackages[0]);
    return isProFromCustomerInfo(purchaseResult.customerInfo);
  } catch (error: any) {
    if (error.userCancelled) {
      // Kullanıcı iptal etti — normal durum
      return false;
    }
    console.error('Purchase error:', error);
    return false;
  }
}

// ─── RESTORE ───
export async function restorePurchases(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    const customerInfo = await Purchases.restorePurchases();
    return isProFromCustomerInfo(customerInfo);
  } catch (error) {
    console.error('Restore error:', error);
    return false;
  }
}

// ─── LISTENER ───
function isProFromCustomerInfo(info: CustomerInfo): boolean {
  if (info.entitlements.active[PRO_ENTITLEMENT] !== undefined) return true;
  if (info.activeSubscriptions && info.activeSubscriptions.length > 0) return true;
  return false;
}

export function addSubscriptionListener(callback: (isPro: boolean) => void): () => void {
  if (Platform.OS === 'web') return () => {};

  const listener = (info: CustomerInfo) => {
    callback(isProFromCustomerInfo(info));
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
