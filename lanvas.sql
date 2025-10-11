--
-- PostgreSQL database dump
--

-- Dumped from database version 14.4
-- Dumped by pg_dump version 14.4

-- Started on 2025-10-11 19:45:09

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 211 (class 1259 OID 25319)
-- Name: banned_user_ids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.banned_user_ids (
    user_id bigint NOT NULL,
    username_at_ban character varying(32)
);


ALTER TABLE public.banned_user_ids OWNER TO postgres;

--
-- TOC entry 212 (class 1259 OID 25329)
-- Name: config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.config (
    key character varying(100) NOT NULL,
    value json NOT NULL
);


ALTER TABLE public.config OWNER TO postgres;

--
-- TOC entry 209 (class 1259 OID 25306)
-- Name: pixels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pixels (
    x integer NOT NULL,
    y integer NOT NULL,
    color character(7) DEFAULT '#ffffff'::bpchar NOT NULL,
    author_id bigint NOT NULL
);


ALTER TABLE public.pixels OWNER TO postgres;

--
-- TOC entry 210 (class 1259 OID 25312)
-- Name: user_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_details (
    user_id bigint NOT NULL,
    username character varying(32) NOT NULL,
    avatar_url text
);


ALTER TABLE public.user_details OWNER TO postgres;

--
-- TOC entry 3180 (class 2606 OID 25318)
-- Name: user_details author_details_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_details
    ADD CONSTRAINT author_details_cache_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3182 (class 2606 OID 25323)
-- Name: banned_user_ids banned_user_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.banned_user_ids
    ADD CONSTRAINT banned_user_ids_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3184 (class 2606 OID 25335)
-- Name: config config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);


--
-- TOC entry 3178 (class 2606 OID 25311)
-- Name: pixels pixels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pixels
    ADD CONSTRAINT pixels_pkey PRIMARY KEY (x, y);


--
-- TOC entry 3185 (class 2606 OID 25324)
-- Name: pixels fk_author_id_user_details; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pixels
    ADD CONSTRAINT fk_author_id_user_details FOREIGN KEY (author_id) REFERENCES public.user_details(user_id) NOT VALID;


--
-- TOC entry 3330 (class 0 OID 0)
-- Dependencies: 211
-- Name: TABLE banned_user_ids; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.banned_user_ids TO lanvas;


--
-- TOC entry 3331 (class 0 OID 0)
-- Dependencies: 212
-- Name: TABLE config; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.config TO lanvas;


--
-- TOC entry 3332 (class 0 OID 0)
-- Dependencies: 209
-- Name: TABLE pixels; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pixels TO lanvas;


--
-- TOC entry 3333 (class 0 OID 0)
-- Dependencies: 210
-- Name: TABLE user_details; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_details TO lanvas;


--
-- TOC entry 2036 (class 826 OID 25299)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO lanvas;


-- Completed on 2025-10-11 19:45:09

--
-- PostgreSQL database dump complete
--

