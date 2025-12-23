export type SupplyRequestStatus = 'pending' | 'approved' | 'rejected';

export type SupplyRequest = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  productUrl: string | null;
  status: SupplyRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  reviewedByUser?: {
    id: string;
    fullName: string;
  };
};

export type CreateSupplyRequestInput = {
  title: string;
  description?: string;
  productUrl?: string;
};
