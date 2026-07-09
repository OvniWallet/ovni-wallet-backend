//Define las interfaces de las entidades de la base de datos que se retornarán o utilizarán.

export interface IUserEntity {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  country_of_residence: string;
  timezone: string;
  kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  created_at: Date;
  updated_at: Date;
}

export interface IRegisterResponse {
  user: Omit<IUserEntity, 'password_hash' | 'updated_at'>;
}