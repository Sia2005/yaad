/**
 * Yaad — demo seed script
 *
 * Creates the Sharma family: one patient, five people across four roles,
 * eight approved life memories (chunked + embedded), and a day of caregiver
 * updates. Safe to re-run.
 *
 *   npm run seed          # build/rebuild the demo family
 *   npm run seed -- --wipe  # remove the demo family entirely
 *
 * Everything here goes through the real models, so every invariant the app
 * enforces (password hashing, two-person approval) is enforced here too.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const Patient = require('../models/Patient');
const FamilyMembership = require('../models/FamilyMembership');
const Consent = require('../models/Consent');
const Memory = require('../models/Memory');
const MemoryChunk = require('../models/MemoryChunk');
const DailyNote = require('../models/DailyNote');

const { chunkText } = require('../services/chunking.service');
const { embedText } = require('../services/embedding.service');

const DEMO_PASSWORD = 'demo1234';

// ---------------------------------------------------------------- the family
const PEOPLE = [
  { key: 'priya', name: 'Priya Sharma',  email: 'priya@sharma.demo',  role: 'familyAdmin' },
  { key: 'meera', name: 'Meera Sharma',  email: 'meera@sharma.demo',  role: 'familyAdmin' },
  { key: 'arjun', name: 'Arjun Sharma',  email: 'arjun@sharma.demo',  role: 'contributor' },
  { key: 'raju',  name: 'Raju Kadam',    email: 'raju@sharma.demo',   role: 'attendant'   },
  { key: 'iyer',  name: 'Dr. Lakshmi Iyer', email: 'iyer@clinic.demo', role: 'clinician'  },
];

const PATIENT = {
  name: 'Kamala Sharma',
  preferredLanguage: 'hi-en',
  stage: 'middle',
};

// ------------------------------------------------------- her life, in her ear
// Written in second person — this is how the Mirror will speak them back to her.
const MEMORIES = [
  {
    title: 'Aapki shaadi',
    uploader: 'meera',
    approver: 'priya',
    transcript:
      'आपकी शादी 1962 में हुई थी, जब आप बीस साल की थीं। आपने लाल रंग का लहंगा पहना था जिस पर सुनहरी ज़री का काम था। शादी नागपुर में हुई थी, आपके पिताजी के घर के आँगन में। सब लोगों ने आपकी बहुत तारीफ़ की थी — सब कह रहे थे आप एकदम मीना कुमारी जैसी लग रही हैं। बारात शाम को आई थी और पूरी रात शहनाई बजती रही।',
  },
  {
    title: 'Aapki pehli naukri',
    uploader: 'arjun',
    approver: 'priya',
    transcript:
      'आपने अपनी पहली नौकरी 1968 में की थी, नागपुर के एक सरकारी स्कूल में। आप तीसरी और चौथी कक्षा को हिंदी पढ़ाती थीं। आप रोज़ साइकिल से स्कूल जाती थीं। बच्चे आपको बहुत पसंद करते थे क्योंकि आप उन्हें कहानियाँ सुनाती थीं। आपने अठारह साल वहाँ पढ़ाया।',
  },
  {
    title: 'Ramesh ji',
    uploader: 'priya',
    approver: 'meera',
    transcript:
      'आपके पति का नाम रमेश शर्मा था। वो रेलवे में काम करते थे। उन्हें बागवानी का बहुत शौक था और वो हर इतवार को सुबह बगीचे में गुलाब के पौधों की देखभाल करते थे। वो आपको प्यार से "कमली" बुलाते थे। उन्हें आपके हाथ की खिचड़ी बहुत पसंद थी।',
  },
  {
    title: 'Pune wala ghar',
    uploader: 'meera',
    approver: 'priya',
    transcript:
      'आप 1981 में पुणे आ गई थीं। आपका घर कोथरूड में था, दो मंज़िला, और उसके सामने एक बहुत बड़ा नीम का पेड़ था। गर्मियों में आप उसी नीम की छाँव में चारपाई डालकर बैठती थीं। घर का दरवाज़ा नीले रंग का था। पड़ोस में सुशीला आंटी रहती थीं, आप दोनों रोज़ शाम को चाय पीती थीं।',
  },
  {
    title: 'Arjun ka janm',
    uploader: 'priya',
    approver: 'meera',
    transcript:
      'आपके पोते अर्जुन का जन्म 1999 में हुआ था, बारिश के मौसम में। आप उस दिन अस्पताल में सबसे पहले पहुँची थीं। जब आपने उसे गोद में लिया तो वो रोना बंद कर के आपको देखने लगा। आपने कहा था कि इसकी आँखें बिलकुल रमेश जी जैसी हैं। आपने ही उसका नाम अर्जुन रखा था।',
  },
  {
    title: 'Aapke besan ke laddoo',
    uploader: 'arjun',
    approver: 'priya',
    transcript:
      'आपके हाथ के बेसन के लड्डू पूरे मोहल्ले में मशहूर थे। आप उन्हें दिवाली पर बनाती थीं, और हमेशा असली घी में। आप कहती थीं कि बेसन को धीमी आँच पर भूनना पड़ता है, जब तक खुशबू न आ जाए — जल्दबाज़ी करोगे तो स्वाद नहीं आएगा। हर दिवाली पर आप पड़ोसियों के घर लड्डू भेजती थीं।',
  },
  {
    title: 'Aapka gaon',
    uploader: 'meera',
    approver: 'priya',
    transcript:
      'आप विदर्भ के एक छोटे से गाँव में पली-बढ़ी थीं। वहाँ एक पुराना कुआँ था जिसके पास आप और आपकी बहनें खेलती थीं। गाँव में हर साल गणपति का बड़ा उत्सव होता था। आपके पिताजी वहाँ के डाकघर में काम करते थे। आपको आम के पेड़ पर चढ़ना आता था, जो उस ज़माने में लड़कियाँ कम ही करती थीं।',
  },
  {
    title: 'Aapke gaane',
    uploader: 'arjun',
    approver: 'meera',
    transcript:
      'आपको लता मंगेशकर के गाने बहुत पसंद हैं। "लग जा गले" आपका सबसे पसंदीदा गाना है। आप काम करते हुए अक्सर गुनगुनाती थीं। आपके पास एक पुराना रेडियो था जो आप रसोई में चलाती थीं। रमेश जी कहते थे कि आपकी आवाज़ बहुत मीठी है।',
  },
];

// ------------------------------------------------- a day in Kamala ji's life
// Hours are today, so the timeline reads like a real morning.
const DAILY = [
  { hour: 8,  minute: 10, author: 'raju',  text: 'Kamala ji ne subah 8 baje poha khaya aur chai pi. Aaj mood achha tha, mujhse baat ki.' },
  { hour: 9,  minute: 30, author: 'raju',  text: 'Subah ki dawai le li — BP ki goli aur calcium. BP normal tha.' },
  { hour: 11, minute: 0,  author: 'raju',  text: 'Thodi der bagiche mein baithe, dhoop achhi thi. Neem ke ped ki baat kar rahi thi.' },
  { hour: 13, minute: 15, author: 'priya', text: 'Dopahar ka khana — dal, chawal aur lauki ki sabzi. Puri thali khatam ki.' },
  { hour: 16, minute: 0,  author: 'arjun', text: 'Main milne aaya tha. Saath mein chai pi, purane photo dekhe. Mujhe pehchan liya aaj.' },
  { hour: 18, minute: 30, author: 'raju',  text: 'Shaam ki dawai de di. Thodi bechaini thi, radio par gaane laga diye to shaant ho gayi.' },
];

// ---------------------------------------------------------------- helpers
const log = (...a) => console.log('[seed]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const atToday = (hour, minute) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

// ---------------------------------------------------------------- wipe
const wipe = async () => {
  const emails = PEOPLE.map((p) => p.email);
  const users = await User.find({ email: { $in: emails } });
  const userIds = users.map((u) => u._id);

  const patients = await Patient.find({ createdBy: { $in: userIds } });
  const patientIds = patients.map((p) => p._id);

  if (patientIds.length) {
    await MemoryChunk.deleteMany({ patient: { $in: patientIds } });
    await Memory.deleteMany({ patient: { $in: patientIds } });
    await DailyNote.deleteMany({ patient: { $in: patientIds } });
    await Consent.deleteMany({ patient: { $in: patientIds } });
    await FamilyMembership.deleteMany({ patient: { $in: patientIds } });
    await Patient.deleteMany({ _id: { $in: patientIds } });
  }
  await User.deleteMany({ _id: { $in: userIds } });

  log(`wiped ${users.length} user(s), ${patients.length} patient(s) and everything hanging off them`);
};

// ---------------------------------------------------------------- seed
const seed = async () => {
  // Idempotency: delete-then-rebuild, the same pattern the embedding worker
  // uses. Any run produces the same end state, however the last one died.
  await wipe();

  // --- people ---------------------------------------------------------
  // NOTE: User.create() (not insertMany) — create fires the pre('save') hook
  // that hashes the password. insertMany SKIPS middleware and would store
  // these in plaintext.
  const users = {};
  for (const person of PEOPLE) {
    users[person.key] = await User.create({
      name: person.name,
      email: person.email,
      password: DEMO_PASSWORD,
    });
  }
  log(`created ${PEOPLE.length} users`);

  // --- the patient ----------------------------------------------------
  const patient = await Patient.create({
    ...PATIENT,
    createdBy: users.priya._id,
  });

  await Consent.create({
    patient: patient._id,
    state: 'active',
    voiceCloningPermitted: false, // opt-in, never assumed
    notes:
      'Recorded with Kamala ji in 2023, while she could still give it. Voice cloning not permitted.',
  });

  for (const person of PEOPLE) {
    await FamilyMembership.create({
      user: users[person.key]._id,
      patient: patient._id,
      role: person.role,
      status: 'active',
      invitedBy: person.key === 'priya' ? undefined : users.priya._id,
    });
  }
  log(`created patient "${patient.name}" with ${PEOPLE.length} memberships`);

  // --- her memories ---------------------------------------------------
  let chunkCount = 0;
  for (const m of MEMORIES) {
    // uploader !== approver, because the schema hook refuses otherwise.
    // The seed has to obey the same rule a malicious relative would hit.
    const memory = await Memory.create({
      patient: patient._id,
      uploadedBy: users[m.uploader]._id,
      type: 'story',
      title: m.title,
      transcript: m.transcript,
      status: 'pending',
    });

    memory.status = 'approved';
    memory.approvedBy = users[m.approver]._id;
    await memory.save();

    // embed inline so the seed needs no worker running
    const chunks = chunkText(m.transcript);
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(chunks[i], 'RETRIEVAL_DOCUMENT');
      await MemoryChunk.create({
        patient: patient._id,
        memory: memory._id,
        chunkIndex: i,
        text: chunks[i],
        embedding,
      });
      chunkCount++;
      await sleep(250); // stay polite to the free-tier rate limit
    }
    log(`  memory "${m.title}" → ${chunks.length} chunk(s)`);
  }
  log(`created ${MEMORIES.length} approved memories, ${chunkCount} chunks embedded`);

  // --- one pending memory, so the approval queue isn't empty -----------
  await Memory.create({
    patient: patient._id,
    uploadedBy: users.arjun._id,
    type: 'story',
    title: 'Aapki Nagpur wali saheli',
    transcript:
      'आपकी सबसे पक्की सहेली सुशीला थीं। आप दोनों साथ में स्कूल में पढ़ाती थीं और हर शाम साथ चाय पीती थीं।',
    status: 'pending',
  });
  log('created 1 pending memory (for the approval queue)');

  // --- today with Kamala ji -------------------------------------------
  for (const d of DAILY) {
    const when = atToday(d.hour, d.minute);
    const embedding = await embedText(d.text, 'RETRIEVAL_DOCUMENT');

    const note = await DailyNote.create({
      patient: patient._id,
      author: users[d.author]._id,
      text: d.text,
      embedding,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    // Backdate createdAt to build a believable timeline. `timestamps: false`
    // stops Mongoose from stamping updatedAt over our value.
    await DailyNote.updateOne(
      { _id: note._id },
      { $set: { createdAt: when } },
      { timestamps: false }
    );
    await sleep(250);
  }
  log(`created ${DAILY.length} daily notes across today`);

  // --- done -----------------------------------------------------------
  console.log(`
──────────────────────────────────────────────────────────────
  The Sharmas are ready.

  Patient        ${patient.name}
  Patient id     ${patient._id}

  Log in as (password for everyone: ${DEMO_PASSWORD})
    priya@sharma.demo   Family admin   — sees everything
    meera@sharma.demo   Family admin   — the second approver
    arjun@sharma.demo   Contributor    — adds life memories
    raju@sharma.demo    Caregiver      — logs her day
    iyer@clinic.demo    Clinician      — patterns only

  Try at the Mirror:  "meri shaadi mein maine kya pehna tha?"
                      "maine aaj kya khaya?"
                      "mera favourite cricket player kaun hai?"  (refuses)
──────────────────────────────────────────────────────────────
`);
};

// ---------------------------------------------------------------- run
const main = async () => {
  await connectDB();
  try {
    if (process.argv.includes('--wipe')) {
      await wipe();
      log('done — demo family removed');
    } else {
      await seed();
    }
  } catch (err) {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

main();