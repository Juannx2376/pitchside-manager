// Pools de nombres por región lingüística para jugadores, ciudades y clubes generados.
import type { Rng } from '../rng';
import type { NameRegion } from './countries';

interface NamePool {
  first: string[];
  last: string[];
  cityPre: string[];
  citySuf: string[];
  clubPatterns: string[];
}

const P: Record<NameRegion, NamePool> = {
  es: {
    first: ['Juan', 'Carlos', 'Andrés', 'Diego', 'Santiago', 'Mateo', 'Sebastián', 'Luis', 'Javier', 'Miguel', 'Alejandro', 'Daniel', 'Felipe', 'Pablo', 'Sergio', 'Jorge', 'Iván', 'Nicolás', 'Tomás', 'Cristian', 'Óscar', 'Raúl', 'Héctor', 'Jhon', 'Yerson', 'Brayan', 'Kevin', 'Álvaro', 'Rodrigo', 'Emiliano'],
    last: ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Moreno', 'Muñoz', 'Rojas', 'Castro', 'Ortiz', 'Silva', 'Vargas', 'Herrera', 'Medina', 'Aguilar', 'Cuadrado', 'Mosquera', 'Valencia', 'Cardona', 'Arango', 'Navarro', 'Romero', 'Ibarra', 'Quintero'],
    cityPre: ['San ', 'Villa ', 'Puerto ', 'Santa ', 'Alca', 'Bena', 'Cara', 'Mira', 'Sala', 'Coro', 'Valde', 'Torre', 'Monte', 'Rio'],
    citySuf: ['nueva', 'lejo', 'rosa', 'verde', 'mar', 'bal', 'dora', 'sierra', 'llano', 'fuerte', 'lares', 'bella', 'flores', 'castillo', 'peñas'],
    clubPatterns: ['Atlético {c}', 'Deportivo {c}', 'Real {c}', 'Club {c}', 'Independiente {c}', 'Unión {c}', 'Racing {c}', 'Sporting {c}', 'CD {c}', '{c} FC', 'Deportes {c}', 'Atlético Nacional {c}', 'Cultural {c}', 'Juventud {c}'],
  },
  pt: {
    first: ['João', 'Pedro', 'Lucas', 'Gabriel', 'Rafael', 'Thiago', 'Bruno', 'Diogo', 'Rúben', 'Vitor', 'Matheus', 'Gustavo', 'Felipe', 'André', 'Tiago', 'Ricardo', 'Nuno', 'Rodrigo', 'Vinícius', 'Caio', 'Endrick', 'Danilo', 'Éder', 'Wesley'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Carvalho', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Araújo', 'Barbosa', 'Nunes', 'Moreira', 'Teixeira', 'Lima', 'Mendes', 'Cardoso', 'Pinto', 'Fonseca', 'Monteiro'],
    cityPre: ['São ', 'Vila ', 'Porto ', 'Santa ', 'Belo', 'Campo', 'Rio ', 'Nova ', 'Bra', 'Ita', 'Gua'],
    citySuf: ['grande', 'mar', 'verde', 'lândia', 'nova', 'tinga', 'jaí', 'rema', 'paço', 'formosa', 'bela', 'serra'],
    clubPatterns: ['{c} FC', 'Esporte Clube {c}', 'Sport {c}', 'Atlético {c}', 'Grêmio {c}', 'SC {c}', 'Clube Desportivo {c}', 'União {c}', 'Ferroviário {c}', 'Vitória {c}'],
  },
  en: {
    first: ['James', 'Jack', 'Harry', 'Oliver', 'Charlie', 'George', 'Thomas', 'William', 'Daniel', 'Ryan', 'Callum', 'Kyle', 'Luke', 'Mason', 'Jordan', 'Tyler', 'Ethan', 'Liam', 'Connor', 'Jamal', 'Marcus', 'Declan', 'Reece', 'Jayden', 'Kieran'],
    last: ['Smith', 'Jones', 'Williams', 'Brown', 'Taylor', 'Davies', 'Evans', 'Wilson', 'Johnson', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Clarke', 'Campbell', 'Murray', 'Stewart', 'Baker', 'Mitchell', 'Henderson'],
    cityPre: ['North', 'South', 'West', 'East', 'Ash', 'Brad', 'Ches', 'Wey', 'Hart', 'Kings', 'Stan', 'Mill', 'Black', 'Red', 'Long'],
    citySuf: ['ford', 'field', 'ton', 'bury', 'ham', 'wick', 'mouth', 'bridge', 'pool', 'ley', 'chester', 'stead', 'port', 'dale', 'gate'],
    clubPatterns: ['{c} United', '{c} City', '{c} Town', '{c} Rovers', '{c} Athletic', '{c} Wanderers', '{c} Albion', '{c} County', '{c} FC', 'Real {c} FC', '{c} Rangers', '{c} Harbour FC'],
  },
  fr: {
    first: ['Lucas', 'Hugo', 'Théo', 'Antoine', 'Kylian', 'Ousmane', 'Moussa', 'Mamadou', 'Ibrahima', 'Youssouf', 'Aurélien', 'Raphaël', 'Jules', 'Adrien', 'Kingsley', 'Randal', 'Wesley', 'Boubacar', 'Sékou', 'Abdou', 'Florian', 'Mathis'],
    last: ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Lefèvre', 'Fofana', 'Koné', 'Traoré', 'Diallo', 'Camara', 'Cissé', 'Touré', 'Kanté', 'Sissoko', 'Mbaye', 'Ndiaye', 'Girard', 'Bonnet', 'Lambert', 'Fontaine', 'Rousseau', 'Mendy', 'Bamba'],
    cityPre: ['Saint-', 'Mont', 'Beau', 'Ville', 'Bel', 'Châte', 'Roche', 'Clair', 'Port-', 'Val'],
    citySuf: ['villiers', 'mont', 'lieu', 'fort', 'court', 'ville', 'aux', 'bourg', 'rive', 'champ', 'pierre', 'lac'],
    clubPatterns: ['FC {c}', 'AS {c}', 'Stade {c}', 'Olympique {c}', 'US {c}', 'Racing Club {c}', 'AJ {c}', 'SC {c}', 'Union Sportive {c}', 'Étoile {c}'],
  },
  it: {
    first: ['Marco', 'Luca', 'Alessandro', 'Lorenzo', 'Federico', 'Matteo', 'Giorgio', 'Davide', 'Nicolò', 'Andrea', 'Simone', 'Francesco', 'Riccardo', 'Gianluca', 'Stefano', 'Daniele', 'Mattia', 'Giacomo', 'Fabio', 'Sandro'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barella', 'Chiesa', 'Bastoni'],
    cityPre: ['San ', 'Monte', 'Castel', 'Villa', 'Porto ', 'Borgo ', 'Torre ', 'Cas', 'Fio', 'Ber'],
    citySuf: ['franco', 'rosso', 'verde', 'nuovo', 'mare', 'vecchio', 'lago', 'fiore', 'gamo', 'renza', 'tino', 'sella'],
    clubPatterns: ['AC {c}', 'US {c}', 'SS {c}', 'Calcio {c}', '{c} Calcio', 'FC {c}', 'Unione Sportiva {c}', 'Sporting {c}', 'Virtus {c}', 'Real {c}'],
  },
  de: {
    first: ['Lukas', 'Leon', 'Jonas', 'Felix', 'Maximilian', 'Niklas', 'Florian', 'Kai', 'Thomas', 'Joshua', 'Julian', 'Leroy', 'Timo', 'Marco', 'Jan', 'Benjamin', 'Tobias', 'Fabian', 'Moritz', 'David', 'Jamal', 'Florian'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neuer', 'Kimmich', 'Werner', 'Schröder', 'Neumann', 'Braun', 'Zimmermann', 'Hartmann', 'Krüger'],
    cityPre: ['Neu', 'Ober', 'Unter', 'Bad ', 'Groß', 'Klein', 'Ham', 'Lands', 'Stein', 'Rosen', 'Wald', 'Burg'],
    citySuf: ['berg', 'burg', 'dorf', 'hausen', 'heim', 'stadt', 'feld', 'bach', 'au', 'furt', 'hof', 'kirchen'],
    clubPatterns: ['FC {c}', 'SV {c}', 'VfB {c}', 'VfL {c}', 'TSV {c}', 'Borussia {c}', 'Eintracht {c}', 'SC {c}', '1. FC {c}', 'Fortuna {c}', 'SpVgg {c}', 'Rot-Weiss {c}'],
  },
  nl: {
    first: ['Daan', 'Sem', 'Lucas', 'Milan', 'Jesse', 'Thijs', 'Bram', 'Ruben', 'Stijn', 'Joey', 'Cody', 'Denzel', 'Xavi', 'Ryan', 'Tijjani', 'Jurriën', 'Frenkie', 'Virgil', 'Teun', 'Wout', 'Arne', 'Kevin', 'Dries', 'Romelu'],
    last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'Peeters', 'Janssens', 'Maes', 'Jacobs', 'Willems', 'Claes', 'Goossens', 'Vermeulen', 'Dekker', 'Koopmeiners', 'Timber'],
    cityPre: ['Groot', 'Klein', 'Noord', 'Zuid', 'Oost', 'West', 'Ber', 'Hoog', 'Brug', 'Dor'],
    citySuf: ['dam', 'dijk', 'hoven', 'veen', 'wijk', 'zand', 'broek', 'horst', 'gem', 'recht', 'stad', 'hout'],
    clubPatterns: ['{c} FC', 'FC {c}', 'SC {c}', 'VV {c}', 'Sparta {c}', 'Go Ahead {c}', 'KV {c}', 'Royal {c}', 'RC {c}', 'KAA {c}'],
  },
  nordic: {
    first: ['Erik', 'Lars', 'Magnus', 'Kasper', 'Oscar', 'Emil', 'Mathias', 'Rasmus', 'Viktor', 'Anders', 'Martin', 'Sander', 'Jonas', 'Elias', 'Aron', 'Gylfi', 'Kristian', 'Mikkel', 'Andreas', 'Henrik', 'Teemu', 'Joel'],
    last: ['Hansen', 'Johansson', 'Nielsen', 'Larsen', 'Andersen', 'Pedersen', 'Karlsson', 'Nilsson', 'Eriksson', 'Olsen', 'Berg', 'Lindqvist', 'Haaland', 'Ødegaard', 'Sigurdsson', 'Virtanen', 'Korhonen', 'Kristensen', 'Holm', 'Lund', 'Dahl', 'Strand'],
    cityPre: ['Nord', 'Sønder', 'Vest', 'Øster', 'Lille', 'Stor', 'Lin', 'Hel', 'Fjell', 'Sand', 'Ros'],
    citySuf: ['vik', 'borg', 'havn', 'by', 'stad', 'ström', 'fjord', 'dal', 'køping', 'holm', 'sund', 'berg'],
    clubPatterns: ['{c} IF', '{c} BK', 'IFK {c}', '{c} FK', 'IK {c}', '{c} BoIS', 'FC {c}', 'AIK {c}', '{c} Fotball', 'Rosenborg {c}'],
  },
  slav: {
    first: ['Ivan', 'Luka', 'Marko', 'Nikola', 'Aleksandr', 'Dmitri', 'Sergei', 'Andriy', 'Jakub', 'Tomáš', 'Robert', 'Piotr', 'Mateusz', 'Milan', 'Dušan', 'Stefan', 'Artem', 'Mykhailo', 'Vladimir', 'Bogdan', 'Petar', 'Josip', 'Khvicha', 'Nodar'],
    last: ['Ivanov', 'Petrov', 'Kovačević', 'Horvat', 'Novák', 'Kowalski', 'Nowak', 'Jovanović', 'Petrović', 'Shevchenko', 'Kovalenko', 'Popescu', 'Ionescu', 'Lewandowski', 'Modrić', 'Vlahović', 'Mudryk', 'Zieliński', 'Kvaratskhelia', 'Babić', 'Marković', 'Sokolov', 'Smirnov'],
    cityPre: ['Novo', 'Staro', 'Belo', 'Krasno', 'Zlato', 'Gorni ', 'Dolni ', 'Vel', 'Pol', 'Sla'],
    citySuf: ['grad', 'gorod', 'sk', 'vo', 'ice', 'ov', 'ava', 'polje', 'nik', 'dar', 'mir', 'slav'],
    clubPatterns: ['FK {c}', 'Dinamo {c}', 'Spartak {c}', 'Lokomotiv {c}', 'Torpedo {c}', 'Slavia {c}', 'Sloboda {c}', 'Zenit {c}', 'Partizan {c}', 'Rudar {c}', 'Metalurg {c}', 'Shakhtar {c}'],
  },
  gr: {
    first: ['Giorgos', 'Konstantinos', 'Dimitris', 'Nikos', 'Kostas', 'Vangelis', 'Panagiotis', 'Christos', 'Andreas', 'Ioannis', 'Petros', 'Anastasios', 'Fotis', 'Manolis'],
    last: ['Papadopoulos', 'Papadakis', 'Georgiou', 'Nikolaidis', 'Ioannidis', 'Christodoulou', 'Konstantinou', 'Pavlidis', 'Mavropanos', 'Tsimikas', 'Bakasetas', 'Masouras', 'Athanasiadis', 'Vlachodimos'],
    cityPre: ['Nea ', 'Agia ', 'Ano ', 'Kato ', 'Ther', 'Kal', 'Lar', 'Pat'],
    citySuf: ['polis', 'mi', 'issa', 'ani', 'ona', 'ra', 'ikos', 'ada'],
    clubPatterns: ['{c} FC', 'AE {c}', 'PAS {c}', 'Aris {c}', 'Atromitos {c}', 'Apollon {c}', 'Panionios {c}', 'Ethnikos {c}'],
  },
  tr: {
    first: ['Mehmet', 'Mustafa', 'Ahmet', 'Emre', 'Burak', 'Hakan', 'Arda', 'Kerem', 'Cengiz', 'Ozan', 'Kaan', 'Yusuf', 'Ferdi', 'Merih', 'Çağlar', 'Orkun', 'Barış', 'Kenan', 'Elnur', 'Rustam'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Güler', 'Çalhanoğlu', 'Ünder', 'Kökçü', 'Akgün', 'Aliyev', 'Mammadov', 'Hasanov', 'Özdemir'],
    cityPre: ['Yeni', 'Eski', 'Kara', 'Ak', 'Bal', 'Göl', 'Kızıl', 'Ilı', 'Er'],
    citySuf: ['köy', 'şehir', 'kale', 'dere', 'pınar', 'yurt', 'su', 'tepe', 'kent'],
    clubPatterns: ['{c}spor', '{c} SK', '{c} FK', '{c} Belediyespor', '{c} Gençlik', 'İdman Yurdu {c}', '{c} Gücü'],
  },
  ar: {
    first: ['Mohamed', 'Ahmed', 'Youssef', 'Omar', 'Ali', 'Hassan', 'Karim', 'Khalid', 'Salem', 'Abdullah', 'Hakim', 'Riyad', 'Sofiane', 'Achraf', 'Fahad', 'Saud', 'Mahmoud', 'Tarek', 'Amine', 'Bilal', 'Ismail', 'Hamza', 'Yassine'],
    last: ['Al-Dawsari', 'Al-Shehri', 'Salah', 'Mahrez', 'Hakimi', 'Ziyech', 'Bounou', 'El Shenawy', 'Al-Faraj', 'Ben Youssef', 'Belaïli', 'Bennacer', 'Amrabat', 'Hamdallah', 'Al-Owais', 'Afif', 'Al-Haydos', 'Trezeguet', 'Msakni', 'Slimani', 'Haddad', 'Nasser', 'Mansour'],
    cityPre: ['Al-', 'Ras ', 'Bab ', 'Ain ', 'Dar ', 'Sidi ', 'Bir ', 'Jebel '],
    citySuf: ['Nour', 'Qasr', 'Salam', 'Medina', 'Bahr', 'Rayan', 'Wahda', 'Khor', 'Fajr', 'Hilal', 'Zahra', 'Ramla'],
    clubPatterns: ['{c} SC', 'Al {c}', 'Ittihad {c}', 'Wydad {c}', 'Raja {c}', 'Ahli {c}', 'Nasr {c}', 'Shabab {c}', 'Esperance {c}', 'Club Sportif {c}'],
  },
  fa: {
    first: ['Mehdi', 'Ali', 'Sardar', 'Alireza', 'Reza', 'Saman', 'Milad', 'Hossein', 'Morteza', 'Ehsan', 'Karim', 'Omid', 'Amir', 'Rahmat'],
    last: ['Taremi', 'Azmoun', 'Jahanbakhsh', 'Ghoddos', 'Pouraliganji', 'Hosseini', 'Karimi', 'Rezaei', 'Ahmadi', 'Mohammadi', 'Nazari', 'Rahimi', 'Habibi', 'Sadeghi'],
    cityPre: ['Shah', 'Bandar ', 'Kuh', 'Dasht', 'Nik', 'Gol'],
    citySuf: ['abad', 'shahr', 'dasht', 'rud', 'kan', 'gah', 'san', 'zar'],
    clubPatterns: ['{c} FC', 'Esteghlal {c}', 'Sepahan {c}', 'Zob Ahan {c}', 'Tractor {c}', 'Foolad {c}', 'Shahin {c}'],
  },
  ja: {
    first: ['Takumi', 'Kaoru', 'Daichi', 'Ritsu', 'Takefusa', 'Wataru', 'Hiroki', 'Kenta', 'Shoya', 'Yuki', 'Ko', 'Ayase', 'Junya', 'Reo', 'Daizen', 'Keito', 'Hidemasa', 'Sota', 'Haruto', 'Yuto'],
    last: ['Minamino', 'Mitoma', 'Kamada', 'Doan', 'Kubo', 'Endo', 'Tomiyasu', 'Itakura', 'Ueda', 'Ito', 'Morita', 'Maeda', 'Suzuki', 'Tanaka', 'Watanabe', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Sato', 'Takahashi'],
    cityPre: ['Kita', 'Minami', 'Higashi', 'Nishi', 'Yama', 'Kawa', 'Shin', 'Taka', 'Naga', 'Oka'],
    citySuf: ['moto', 'saki', 'hama', 'mura', 'shima', 'yama', 'zawa', 'gawa', 'hara', 'oka'],
    clubPatterns: ['{c} FC', '{c} United', 'Sanfrecce {c}', '{c} Reysol', 'Vissel {c}', 'Cerezo {c}', '{c} Antlers', '{c} Frontale', '{c} Marinos', 'Gamba {c}'],
  },
  ko: {
    first: ['Heung-min', 'Min-jae', 'Kang-in', 'Hee-chan', 'Jae-sung', 'Woo-young', 'Gue-sung', 'In-beom', 'Seung-ho', 'Young-gwon', 'Jin-su', 'Hyun-woo', 'Ji-sung', 'Dong-jun'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Hwang', 'Son', 'Oh', 'Seol'],
    cityPre: ['Seo', 'Dae', 'Gwang', 'Cheon', 'Su', 'An', 'Ul', 'Po', 'Gim', 'Jeon'],
    citySuf: ['won', 'jeon', 'ju', 'san', 'gu', 'cheon', 'hang', 'seong', 'nam', 'pyeong'],
    clubPatterns: ['{c} FC', '{c} Hyundai', '{c} Steelers', '{c} United', '{c} Bluewings', '{c} Citizen', '{c} Hana'],
  },
  zh: {
    first: ['Wei', 'Lei', 'Hao', 'Jun', 'Tao', 'Peng', 'Bin', 'Chen', 'Yang', 'Qiang', 'Long', 'Xin', 'Zhi', 'Kai', 'Ming', 'Tian', 'Yu', 'Hui'],
    last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'Lin', 'Wu'],
    cityPre: ['Shang', 'Bei', 'Nan', 'Dong', 'Xi', 'Guang', 'Chang', 'Tian', 'Qing', 'Wu'],
    citySuf: ['jing', 'hai', 'zhou', 'yang', 'sha', 'dao', 'han', 'ning', 'chuan', 'an'],
    clubPatterns: ['{c} FC', '{c} Shenhua', '{c} Taishan', '{c} Port', '{c} Guoan', '{c} Rongcheng', '{c} Zhiye', '{c} Hailiang'],
  },
  sea: {
    first: ['Chanathip', 'Teerasil', 'Nguyen', 'Quang', 'Egy', 'Witan', 'Pratama', 'Safawi', 'Faisal', 'Ikhsan', 'Supachai', 'Phan', 'Rizky', 'Arif', 'Dang', 'Hoang', 'Kyaw', 'Aung', 'Sok', 'Panha'],
    last: ['Songkrasin', 'Dangda', 'Hai', 'Quang Hai', 'Maulana', 'Sulaeman', 'Rasid', 'Halim', 'Jaided', 'Van Toan', 'Tien Linh', 'Arhan', 'Fandi', 'Win', 'Naing', 'Vuthy', 'Santos', 'Reyes', 'Bautista', 'Saelim'],
    cityPre: ['Ban', 'Kota ', 'Phu', 'Tanjung ', 'Muang ', 'Nakhon ', 'Bukit ', 'Sungai ', 'Thanh '],
    citySuf: ['Ratchasima', 'Baru', 'Jaya', 'Hoa', 'Indah', 'Long', 'Petra', 'Sakhon', 'Tinh', 'Raya'],
    clubPatterns: ['{c} FC', '{c} United', 'Persib {c}', 'Persija {c}', '{c} City', 'Johor {c}', 'Buriram {c}', 'Hoang Anh {c}'],
  },
  sa: {
    first: ['Sunil', 'Sandesh', 'Gurpreet', 'Anirudh', 'Lallianzuala', 'Sahal', 'Jamal', 'Rahim', 'Tashi', 'Anil', 'Bimal', 'Kiran', 'Imran', 'Faisal', 'Ali', 'Kamal'],
    last: ['Chhetri', 'Jhingan', 'Sandhu', 'Thapa', 'Chhangte', 'Samad', 'Bhuyan', 'Rana', 'Gurung', 'Hossain', 'Khan', 'Rahman', 'Perera', 'Fernando', 'Shrestha', 'Dorji'],
    cityPre: ['Chandi', 'Rajn', 'Hyder', 'Bhubane', 'Kol', 'Kath', 'Shil', 'Jai'],
    citySuf: ['garh', 'pur', 'abad', 'swar', 'kata', 'mandu', 'long', 'nagar'],
    clubPatterns: ['{c} FC', '{c} City FC', 'Mohun Bagan {c}', '{c} Blasters', 'Abahani {c}', '{c} United', 'Real {c}'],
  },
  afw: {
    first: ['Victor', 'Samuel', 'Emmanuel', 'Wilfred', 'Ademola', 'Kelechi', 'Alex', 'Mohammed', 'Thomas', 'Kwame', 'Jordan', 'Andre', 'Osman', 'Iñaki', 'Taiwo', 'Frank', 'Calvin', 'Ebere', 'Musa', 'Babajide', 'Sadio', 'Ibrahim'],
    last: ['Osimhen', 'Chukwueze', 'Iheanacho', 'Lookman', 'Ndidi', 'Iwobi', 'Partey', 'Kudus', 'Ayew', 'Williams', 'Bukari', 'Semenyo', 'Onyeka', 'Aribo', 'Awoniyi', 'Boniface', 'Simon', 'Adeyemi', 'Mensah', 'Owusu', 'Okafor', 'Eze'],
    cityPre: ['Aba', 'Ibe', 'Ken', 'Kuma', 'Lok', 'Ogbo', 'Tema', 'Ilo', 'Aku'],
    citySuf: ['kuta', 'ja', 'si', 'mosho', 'rin', 'dan', 'ke', 'gun', 'ra'],
    clubPatterns: ['{c} United', '{c} Stars', '{c} Rangers', '{c} Pillars', 'Hearts of {c}', '{c} Kotoko', '{c} Rovers', '{c} Tornadoes', '{c} Warriors'],
  },
  afe: {
    first: ['Percy', 'Teboho', 'Themba', 'Sipho', 'Lyle', 'Patson', 'Enock', 'Mbwana', 'Khama', 'Michael', 'Joseph', 'Peter', 'Fiston', 'Clatous', 'Tafadzwa', 'Bongani', 'Kagiso', 'Abebe', 'Dawit'],
    last: ['Tau', 'Mokoena', 'Zwane', 'Foster', 'Daka', 'Mwepu', 'Samatta', 'Billiat', 'Olunga', 'Wanyama', 'Mayele', 'Chama', 'Musona', 'Zungu', 'Mabena', 'Ngcobo', 'Banda', 'Phiri', 'Mwale', 'Tadesse'],
    cityPre: ['Mbe', 'Kis', 'Lu', 'Nda', 'Mwa', 'Bula', 'Kit', 'Moro', 'Ari'],
    citySuf: ['umu', 'saka', 'ola', 'nza', 'wayo', 'bani', 'gwe', 'goro', 'sha'],
    clubPatterns: ['{c} City', '{c} Chiefs', '{c} Sundowns', '{c} Pirates', '{c} Stars', 'Simba {c}', 'Young Africans {c}', '{c} Dynamos', '{c} FC'],
  },
  pac: {
    first: ['Roy', 'Teaonui', 'Ilisoni', 'Micah', 'Tamatoa', 'Sione', 'Iosefo', 'Kaveinga', 'Atanasio', 'Ronaldo', 'Junior', 'Alvin', 'Tuimasi', 'Raphael'],
    last: ['Krishna', 'Tehau', 'Lepa', 'Tamakoti', 'Tuilagi', 'Fifita', 'Taumoepeau', 'Naqeleca', 'Kaltak', 'Maemae', 'Puleiu', 'Vakatawa', 'Tepa', 'Manu'],
    cityPre: ['Nuku', 'Lau', 'Lab', 'Vai', 'Apia', 'Pa', 'Hon', 'Lau'],
    citySuf: ["'alofa", 'toka', 'asa', 'lele', 'peete', 'iara', 'tolu', 'mua'],
    clubPatterns: ['{c} FC', '{c} United', '{c} City', 'AS {c}', '{c} Warriors', '{c} Stallions'],
  },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generatePersonName(rng: Rng, region: NameRegion): { firstName: string; lastName: string } {
  const pool = P[region];
  return { firstName: rng.pick(pool.first), lastName: rng.pick(pool.last) };
}

export function generateCityName(rng: Rng, region: NameRegion): string {
  const pool = P[region];
  const pre = rng.pick(pool.cityPre);
  const suf = rng.pick(pool.citySuf);
  if (pre.endsWith(' ') || pre.endsWith('-')) return pre + capitalize(suf);
  return pre + suf;
}

export function generateClubName(rng: Rng, region: NameRegion, usedNames: Set<string>): { name: string; city: string } {
  const pool = P[region];
  for (let attempt = 0; attempt < 40; attempt++) {
    const city = generateCityName(rng, region);
    const name = rng.pick(pool.clubPatterns).replace('{c}', city);
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return { name, city };
    }
  }
  const city = generateCityName(rng, region);
  const name = `${city} ${usedNames.size + 1} FC`;
  usedNames.add(name);
  return { name, city };
}

export function shortClubName(name: string): string {
  const words = name.replace(/[^\p{L}\s-]/gu, '').split(/\s+/).filter((w) => w.length > 2 && !/^(FC|SC|AC|AS|CD|US|SS|SV|VfB|VfL|TSV|Club|Real|Atlético|Deportivo|United|City|Town)$/i.test(w));
  const base = (words[0] ?? name).toUpperCase();
  return base.slice(0, 3);
}
