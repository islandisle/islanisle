import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signup } from '../api/client';

// Implements script Section 2.1's Phase 1 flow:
//   1. Tourist or Local (asked first, before anything else)
//   2. Document upload — mandatory and blocking
//   3. Manual field entry (no OCR yet in Phase 1)
//   4. Language selection (Tourist only)
//   5. Optional travel group creation

const STEPS = ['type', 'document', 'details', 'language', 'group'];

export default function Signup() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  const [wantsGroup, setWantsGroup] = useState(false);

  const step = STEPS[stepIndex];

  function goNext() {
    setError('');
    // Locals skip the language step entirely (Section 2.1 step 4).
    if (step === 'details' && type === 'local') {
      setStepIndex(STEPS.indexOf('group'));
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    setError('');
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('type', type);
      formData.append('name', name);
      formData.append('date_of_birth', dateOfBirth);
      formData.append('document_number', documentNumber);
      formData.append('contact_email', contactEmail);
      formData.append('contact_mobile', contactMobile);
      formData.append('password', password);
      if (type === 'tourist') formData.append('language', language);
      formData.append('travel_group', String(wantsGroup));
      formData.append('document', documentFile);

      const result = await signup(formData);

      // Phase 1 has no login-on-signup token issuance — direct the person
      // to log in next (see auth.js: signup returns the created user, login
      // is the separate call that issues a JWT).
      navigate('/login', { state: { justSignedUp: true, message: result.message } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Join Atoll Isle
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Step {stepIndex + 1} of {type === 'local' ? STEPS.length - 1 : STEPS.length}
      </p>

      {step === 'type' && (
        <TypeStep
          onSelect={(t) => {
            setType(t);
            goNext();
          }}
        />
      )}

      {step === 'document' && (
        <DocumentStep
          type={type}
          onFileSelected={setDocumentFile}
          onBack={goBack}
          onNext={goNext}
          canProceed={!!documentFile}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          name={name} setName={setName}
          dateOfBirth={dateOfBirth} setDateOfBirth={setDateOfBirth}
          documentNumber={documentNumber} setDocumentNumber={setDocumentNumber}
          contactEmail={contactEmail} setContactEmail={setContactEmail}
          contactMobile={contactMobile} setContactMobile={setContactMobile}
          password={password} setPassword={setPassword}
          onBack={goBack}
          onNext={goNext}
        />
      )}

      {step === 'language' && (
        <LanguageStep
          language={language}
          setLanguage={setLanguage}
          onBack={goBack}
          onNext={goNext}
        />
      )}

      {step === 'group' && (
        <GroupStep
          wantsGroup={wantsGroup}
          setWantsGroup={setWantsGroup}
          onBack={goBack}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function TypeStep({ onSelect }) {
  return (
    <div>
      <p style={{ fontSize: 15, marginBottom: 16 }}>Are you a Tourist or a Local?</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => onSelect('tourist')}>
          Tourist
        </button>
        <button className="btn-primary" style={{ flex: 1, background: 'var(--navy)' }} onClick={() => onSelect('local')}>
          Local
        </button>
      </div>
    </div>
  );
}

function DocumentStep({ type, onFileSelected, onBack, onNext, canProceed }) {
  const label = type === 'local' ? 'Maldivian National ID card' : 'Passport';
  return (
    <div>
      <p style={{ fontSize: 15, marginBottom: 4 }}>Upload your {label}</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        This is required to continue — an account with no document on file can't book or transact anywhere in the app.
      </p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onFileSelected(e.target.files[0])}
        style={{ marginBottom: 20 }}
      />
      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canProceed} />
    </div>
  );
}

function DetailsStep(props) {
  const {
    name, setName, dateOfBirth, setDateOfBirth, documentNumber, setDocumentNumber,
    contactEmail, setContactEmail, contactMobile, setContactMobile, password, setPassword,
    onBack, onNext,
  } = props;

  const canProceed = name && dateOfBirth && documentNumber && contactMobile && password;

  return (
    <div>
      <p style={{ fontSize: 15, marginBottom: 16 }}>Your details</p>
      <Field label="Full name" value={name} onChange={setName} />
      <Field label="Date of birth" type="date" value={dateOfBirth} onChange={setDateOfBirth} />
      <Field label="Document number" value={documentNumber} onChange={setDocumentNumber} />
      <Field label="Email (optional)" value={contactEmail} onChange={setContactEmail} />
      <Field label="Mobile number" value={contactMobile} onChange={setContactMobile} />
      <Field label="Password" type="password" value={password} onChange={setPassword} />
      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canProceed} />
    </div>
  );
}

function LanguageStep({ language, setLanguage, onBack, onNext }) {
  const options = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: 'Chinese' },
    { code: 'it', label: 'Italian' },
    { code: 'es', label: 'Spanish' },
  ];
  return (
    <div>
      <p style={{ fontSize: 15, marginBottom: 16 }}>Choose your language</p>
      <select
        className="input-field"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{ marginBottom: 20 }}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        You can change this anytime later in Settings.
      </p>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function GroupStep({ wantsGroup, setWantsGroup, onBack, onSubmit, submitting }) {
  return (
    <div>
      <p style={{ fontSize: 15, marginBottom: 16 }}>Are you traveling with others?</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          className={wantsGroup ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1 }}
          onClick={() => setWantsGroup(true)}
        >
          Yes, I'll get a Group QR
        </button>
        <button
          className={!wantsGroup ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1 }}
          onClick={() => setWantsGroup(false)}
        >
          No, just me
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" onClick={onBack} disabled={submitting}>Back</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function StepNav({ onBack, onNext, nextDisabled }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
      <button className="btn-secondary" onClick={onBack}>Back</button>
      <button className="btn-primary" style={{ flex: 1 }} onClick={onNext} disabled={nextDisabled}>
        Continue
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        className="input-field"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
