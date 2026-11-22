-- Provisório: as RPCs do dashboard (dashboard_data, dashboard_filter_options) ainda não foram
-- otimizadas e levam vários segundos num ano inteiro (~1,5 milhão de linhas). O padrão do Supabase
-- para o papel anon é 3s, o que faria o front receber erro de timeout nos anos maiores.
-- Ao otimizar as consultas, voltar este valor ao padrão (ALTER ROLE anon SET statement_timeout = '3s').
ALTER ROLE anon SET statement_timeout = '30s';

-- O PostgREST lê as configurações dos papéis só ao (re)carregar; isto pede o recarregamento.
NOTIFY pgrst, 'reload config';
